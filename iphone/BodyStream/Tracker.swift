// Tracks one body with ARKit and sends it to any laptop connected over Wi-Fi (a secure WebSocket on port 8443).
//
// Each message (text, JSON), about 60 a second:
//   t  time in ms
//   W, H  the camera picture's size in pixels
//   n  the joint names (every 30th message)
//   p  each joint's x, y, z in metres: x = to the camera's right, y = up (from the phone's height),
//      z = in front of the camera along the floor. Gravity-aligned, so a tilted phone doesn't tilt the body.
//   u  each joint's place in the picture, 0..1 (for drawing the skeleton on it)
//   (p and u are missing when no body is in view)
// Every 4th frame, a small JPEG of the camera picture (binary).
//
// CAMERA MODES (the laptop asks for one, or tap it on the phone): no skeleton; instead every picture from the
// ULTRA-WIDE lens goes out as a JPEG (binary). In DEPTH mode the LiDAR's depth map goes out too, about 15 a
// second (binary, starting "DPTH": width, height as 2-byte numbers, then one 2-byte millimetre value per point).
// Once a second a text message {"mode":"camera"|"depth","lens","fov","dfov","W","H","dW","dH","depth","problem"}.
// The laptop runs MediaPipe on the pictures (and reads real distances from the depth map).
// Laptops can send {"want":"body"}, {"want":"camera"} or {"want":"depth"} to switch the phone's mode.

import Foundation
import Combine   // ObservableObject and @Published live here
import ARKit
import AVFoundation
import RealityKit
import Network
import CoreImage
import ImageIO
import UIKit

final class Tracker: NSObject, ObservableObject, ARSessionDelegate {
    @Published var address = "starting…"
    @Published var status = "starting…"
    @Published var mode = "body"           // "body" (Apple's body tracking), "camera" (ultra-wide pictures) or "depth" (ultra-wide + LiDAR)
    @Published var previewLayer: AVCaptureVideoPreviewLayer?   // depth mode: the live picture on the phone's screen
    @Published var pictureAspect: CGFloat = 4.0 / 3.0   // width ÷ height of the picture, as turned
    @Published var zone: CGSize = .zero
    @Published var uiTurn: Double = 0                    // the phone's own screen: degrees to turn the text so it reads upright
    @Published var previewZone: CGSize = .zero           // the depth zone on the phone's own preview (always drawn upright-shaped)
    @Published var previewAspect: CGFloat = 0.75    // depth mode: how much of the picture the LiDAR covers (fractions of width, height)
    @Published var lines: [CGPoint] = []   // the skeleton on the phone's screen: pairs of points, one pair per bone
    weak var view: ARView?
    private var bonePairs: [(Int, Int)] = []
    private static let boneNames: [(String, String)] = [
        ("hips_joint", "spine_7_joint"), ("spine_7_joint", "neck_1_joint"), ("neck_1_joint", "head_joint"),
        ("left_arm_joint", "right_arm_joint"), ("left_upLeg_joint", "right_upLeg_joint"),
        ("left_arm_joint", "left_forearm_joint"), ("left_forearm_joint", "left_hand_joint"),
        ("right_arm_joint", "right_forearm_joint"), ("right_forearm_joint", "right_hand_joint"),
        ("left_upLeg_joint", "left_leg_joint"), ("left_leg_joint", "left_foot_joint"),
        ("right_upLeg_joint", "right_leg_joint"), ("right_leg_joint", "right_foot_joint"),
    ]

    private let port: NWEndpoint.Port = 8443
    private var listener: NWListener?
    private var clients: [ObjectIdentifier: NWConnection] = [:]   // only touched on netQ
    private let netQ = DispatchQueue(label: "bodystream.net")
    private let imgQ = DispatchQueue(label: "bodystream.img")
    private let ciContext = CIContext()
    private var names: [String] = []
    private var frameN = 0
    private var imgBusy = false
    private var bodyN = 0, clientCount = 0
    private weak var arSession: ARSession?
    private var bodyConfig: ARBodyTrackingConfiguration?
    let camera = CameraStreamer()
    private var statusTimer: Timer?
    private var camSent = 0
    private var arFrames = 0, msgSent = 0                // body mode: camera frames, messages sent
    private var lastCamFrames = 0, lastDepthFrames = 0    // camera modes: the counts a second ago
    private var serverState = "starting the server…"     // what the phone tells you about laptops being able to connect
    private var serverReady = false
    private var lastPoke = Date.distantPast
    private var lastAddress = ""
    private var pending = 0                  // pictures still on their way (only touched on netQ)

    func start(session: ARSession) {
        guard ARBodyTrackingConfiguration.isSupported else {
            status = "This iPhone can't do body tracking (it needs an A12 chip or newer)."
            return
        }
        names = ARSkeletonDefinition.defaultBody3D.jointNames
        bonePairs = Tracker.boneNames.compactMap { a, b in
            guard let i = names.firstIndex(of: a), let k = names.firstIndex(of: b) else { return nil }
            return (i, k)
        }
        // the camera: iPhone asks when the camera first starts; if it was refused before, say where to allow it
        let camAuth = AVCaptureDevice.authorizationStatus(for: .video)
        if camAuth == .notDetermined { AVCaptureDevice.requestAccess(for: .video) { _ in } }
        session.delegate = self
        arSession = session
        let config = ARBodyTrackingConfiguration()
        config.automaticSkeletonScaleEstimationEnabled = true   // learns your real size
        bodyConfig = config
        session.run(config)
        camera.onJPEG = { [weak self] jpeg in
            guard let self = self else { return }
            self.send(jpeg, binary: true)
            DispatchQueue.main.async { self.camSent += 1 }
        }
        camera.onDepth = { [weak self] d in self?.send(d, binary: true, depth: true) }
        camera.onPreview = { [weak self] layer in self?.previewLayer = layer }
        // the text on the phone turns with the phone (the app itself stays upright, like the Camera app)
        let turn: (CGImagePropertyOrientation) -> Void = { [weak self] o in
            var d: Double = 0
            switch o {
            case .up: d = 90        // on its side, top to the left
            case .down: d = -90     // on its side, top to the right
            case .left: d = 180     // upside down
            default: d = 0          // upright
            }
            self?.uiTurn = d
        }
        camera.onTurn = turn
        turn(camera.orient)
        startServer()
        pokeLocalNetwork()
        statusTick()
        statusTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.statusTick() }
    }

    // ---------------- every camera frame ----------------
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        frameN += 1
        arFrames += 1
        let cam = frame.camera
        let res = cam.imageResolution
        if mode != "body" { return }
        var msg: [String: Any] = ["mode": "body", "t": frame.timestamp * 1000, "W": Double(res.width), "H": Double(res.height)]
        if frameN % 30 == 1 { msg["n"] = names }

        if let body = frame.anchors.compactMap({ $0 as? ARBodyAnchor }).first, body.isTracked {
            bodyN += 1
            // a frame standing on the floor at the phone: forward = where the phone looks, kept level
            let ct = cam.transform
            let camPos = SIMD3<Float>(ct.columns.3.x, ct.columns.3.y, ct.columns.3.z)
            var fwd = SIMD3<Float>(-ct.columns.2.x, 0, -ct.columns.2.z)
            if simd_length(fwd) < 0.01 { fwd = SIMD3<Float>(0, 0, -1) }
            fwd = simd_normalize(fwd)
            let right = simd_cross(fwd, SIMD3<Float>(0, 1, 0))
            var p: [Double] = [], u: [Double] = [], worlds: [SIMD3<Float>] = []
            p.reserveCapacity(names.count * 3); u.reserveCapacity(names.count * 2)
            for m in body.skeleton.jointModelTransforms {
                let w = body.transform * m
                let world = SIMD3<Float>(w.columns.3.x, w.columns.3.y, w.columns.3.z)
                worlds.append(world)
                let r = world - camPos
                p.append(Tracker.round3(simd_dot(r, right)))
                p.append(Tracker.round3(r.y))
                p.append(Tracker.round3(simd_dot(r, fwd)))
                let s = cam.projectPoint(world, orientation: .landscapeRight, viewportSize: res)
                u.append(Tracker.round4(Double(s.x / res.width)))
                u.append(Tracker.round4(Double(s.y / res.height)))
            }
            msg["p"] = p
            msg["u"] = u
            // the skeleton on the phone's own screen (every other frame is plenty)
            if frameN % 2 == 0, let v = view {
                var pts: [CGPoint] = []
                for (a, b) in bonePairs where a < worlds.count && b < worlds.count {
                    if let pa = v.project(worlds[a]), let pb = v.project(worlds[b]) { pts.append(pa); pts.append(pb) }
                }
                lines = pts
            }
        } else if !lines.isEmpty && frameN % 2 == 0 {
            lines = []
        }
        if let data = try? JSONSerialization.data(withJSONObject: msg) {
            send(data, binary: false)
            if clientCount > 0 { msgSent += 1 }
        }

        // a small picture for the camera view in Arm Follow
        if frameN % 4 == 0 && !imgBusy && clientCount > 0 {
            imgBusy = true
            let pixels = frame.capturedImage
            imgQ.async { [weak self] in
                guard let self = self else { return }
                let small = CIImage(cvPixelBuffer: pixels).transformed(by: CGAffineTransform(scaleX: 0.25, y: 0.25))
                let opts = [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.5]
                if let jpeg = self.ciContext.jpegRepresentation(of: small, colorSpace: CGColorSpaceCreateDeviceRGB(), options: opts) {
                    self.send(jpeg, binary: true)
                }
                DispatchQueue.main.async { self.imgBusy = false }
            }
        }
    }

    // ---------------- switching between body tracking and camera ----------------
    func setMode(_ m: String) {
        guard m != mode, ["body", "camera", "depth"].contains(m) else { return }
        let was = mode
        mode = m
        if m == "body" {
            camera.stop()
            previewLayer = nil
            if let s = arSession, let c = bodyConfig { s.run(c) }
            return
        }
        if was == "body" { arSession?.pause(); lines = [] }
        camera.start(depth: m == "depth")
        camSent = 0
        lastCamFrames = camera.frameN; lastDepthFrames = camera.depthN
    }

    // ---------------- once a second: the address, the status lines, and (camera modes) the picture's geometry ----------------
    private func statusTick() {
        // the address laptops should use, kept current (switching to the hotspot or another Wi-Fi changes it)
        let cur = Tracker.currentAddress()
        let addr = cur.map { "\($0.ip):\(port.rawValue)" } ?? "not on Wi-Fi or hotspot"
        if addr != address { address = addr }
        if addr != lastAddress { lastAddress = addr; pokeLocalNetwork() }
        if !serverReady && Date().timeIntervalSince(lastPoke) > 10 { pokeLocalNetwork() }
        if mode != "body" { geometryTick() }

        // line 1: can laptops connect?
        var line1 = serverState
        let camAuth = AVCaptureDevice.authorizationStatus(for: .video)
        if camAuth == .denied || camAuth == .restricted { line1 = "Camera blocked: Settings → Bodystream → Camera → on" }
        if let c = cur { line1 += " · via " + c.via }
        // line 2: what's being sent, how fast
        var line2 = ""
        if mode == "body" {
            var seen = "nobody in view (stand 3–4 m away, whole body in the picture)"
            if bodyN > 0 { seen = "body found \(bodyN)/s" }
            line2 = "Body tracking · camera \(arFrames) fps · " + seen
            if clientCount > 0 { line2 += " · sending \(msgSent)/s" }
        } else {
            let c = camera
            let fps = c.frameN - lastCamFrames
            let dps = c.depthN - lastDepthFrames
            lastCamFrames = c.frameN; lastDepthFrames = c.depthN
            if !c.problem.isEmpty { line2 = c.problem }
            else {
                var name: String = "Ultra-wide camera"
                if mode == "depth" { name = "Ultra-wide + depth" }
                line2 = name + ", \(Int(c.fov))° · camera \(fps) fps"
                if c.depthOn { line2 += " · LiDAR \(dps) fps (every other one sent, \(c.depthW)×\(c.depthH))" }
                if clientCount > 0 { line2 += " · sending \(camSent)/s" }
            }
        }
        // line 3: who's connected
        var line3 = "no laptop connected yet"
        if clientCount == 1 { line3 = "1 laptop connected" } else if clientCount > 1 { line3 = "\(clientCount) laptops connected" }
        status = line1 + "\n" + line2 + "\n" + line3
        arFrames = 0; bodyN = 0; msgSent = 0; camSent = 0
    }

    private func geometryTick() {
        let c: CameraStreamer = camera
        // the picture's geometry, worked out the sensor's way round, then swapped if the phone is upright
        let sensorAspect: Double = c.sensorW > 0 ? Double(c.sensorH) / Double(c.sensorW) : 0.75
        let tanX: Double = tan(Double(c.fov) * Double.pi / 360.0)     // half the view across, as a slope
        let tanY: Double = tanX * sensorAspect                          // half the view up-down
        var zoneX: Double = 0
        var zoneY: Double = 0
        if c.depthOn && c.fov > 0 && c.depthW > 0 && c.depthH > 0 {
            // how much of the picture the depth map covers (both lenses look the same way, a centimetre apart)
            let depthAcross: Double = Double(c.sideways ? c.depthH : c.depthW)
            let depthUpDown: Double = Double(c.sideways ? c.depthW : c.depthH)
            let fx: Double = tan(Double(c.depthFov) * Double.pi / 360.0) / tanX
            let fy: Double = fx * (depthUpDown / depthAcross) / sensorAspect
            zoneX = min(1.0, fx)
            zoneY = min(1.0, fy)
        }
        let pictureTanX: Double = c.sideways ? tanY : tanX
        let pictureTanY: Double = c.sideways ? tanX : tanY
        let pictureZoneX: Double = c.sideways ? zoneY : zoneX
        let pictureZoneY: Double = c.sideways ? zoneX : zoneY
        zone = CGSize(width: pictureZoneX, height: pictureZoneY)
        // the phone's own preview stays upright-shaped (the app doesn't rotate), so its zone is the sensor's, turned a quarter
        previewZone = CGSize(width: zoneY, height: zoneX)
        previewAspect = CGFloat(sensorAspect)
        var meta: [String: Any] = [:]
        meta["mode"] = mode
        meta["lens"] = c.lens
        meta["fov"] = Double(c.fov)
        meta["dfov"] = Double(c.depthFov)
        meta["hfov"] = 2.0 * atan(pictureTanX) * 180.0 / Double.pi   // across the picture as sent
        meta["tx"] = pictureTanX
        meta["ty"] = pictureTanY
        meta["zx"] = pictureZoneX
        meta["zy"] = pictureZoneY
        meta["W"] = c.width
        meta["H"] = c.height
        meta["dW"] = c.depthW
        meta["dH"] = c.depthH
        meta["depth"] = c.depthOn
        meta["upright"] = c.sideways
        meta["held"] = c.heldLabel
        meta["problem"] = c.problem
        if let data = try? JSONSerialization.data(withJSONObject: meta) { send(data, binary: false) }
        pictureAspect = c.width > 0 && c.height > 0 ? CGFloat(c.width) / CGFloat(c.height) : 4.0 / 3.0
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        serverState = "Body tracking stopped: \(error.localizedDescription)"
    }

    // ---------------- the server (secure WebSocket) ----------------
    private func startServer() {
        let tls = NWProtocolTLS.Options()
        if let identity = Tracker.loadIdentity(), let secIdentity = sec_identity_create(identity) {
            sec_protocol_options_set_local_identity(tls.securityProtocolOptions, secIdentity)
        } else {
            serverState = "bodystream.p12 is missing from the app (drag it in, tick the app as its target)"
            return
        }
        let params = NWParameters(tls: tls)
        let ws = NWProtocolWebSocket.Options()
        ws.autoReplyPing = true
        params.defaultProtocolStack.applicationProtocols.insert(ws, at: 0)
        params.allowLocalEndpointReuse = true
        do {
            let l = try NWListener(using: params, on: port)
            l.newConnectionHandler = { [weak self] c in self?.accept(c) }
            l.stateUpdateHandler = { [weak self] state in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    switch state {
                    case .ready:
                        self.serverReady = true
                        self.serverState = "Ready for laptops"
                    case .waiting(let e):
                        // usually iPhone's Local Network permission: not given yet, or turned off
                        self.serverReady = false
                        self.serverState = "Laptops can't connect yet: allow Local Network (Settings → Privacy & Security → Local Network → Bodystream) · \(e.localizedDescription)"
                        self.pokeLocalNetwork()
                        self.restartServer(after: 3)
                    case .failed(let e):
                        self.serverReady = false
                        self.serverState = "Server stopped (\(e.localizedDescription)); restarting…"
                        self.restartServer(after: 3)
                    default:
                        break
                    }
                }
            }
            l.start(queue: netQ)
            listener = l
        } catch {
            serverState = "Server couldn't start: \(error.localizedDescription); retrying…"
            restartServer(after: 3)
        }
    }

    private var restarting = false
    private func restartServer(after secs: Double) {
        if restarting { return }
        restarting = true
        DispatchQueue.main.asyncAfter(deadline: .now() + secs) { [weak self] in
            guard let self = self else { return }
            self.restarting = false
            if self.serverReady { return }
            self.listener?.cancel(); self.listener = nil
            self.startServer()
        }
    }

    // LOCAL NETWORK PERMISSION. iPhone only asks "allow Bodystream to find devices on your local network?" when the
    // app itself reaches out to another device; this app only waits for laptops, so without this the question
    // never comes and laptops are refused. So it reaches out on purpose: one tiny message to the network's router.
    private func pokeLocalNetwork() {
        lastPoke = Date()
        for ip in Tracker.allAddresses().values {
            let parts = ip.split(separator: ".")
            guard parts.count == 4 else { continue }
            let router = parts[0...2].joined(separator: ".") + ".1"
            if router == ip { continue }   // on its own hotspot the phone IS the router
            let c = NWConnection(host: NWEndpoint.Host(router), port: 9, using: .udp)
            c.stateUpdateHandler = { s in
                if case .ready = s { c.send(content: Data([0]), completion: .contentProcessed { _ in c.cancel() }) }
            }
            c.start(queue: netQ)
            netQ.asyncAfter(deadline: .now() + 3) { c.cancel() }
        }
    }

    private func accept(_ c: NWConnection) {
        let key = ObjectIdentifier(c)
        c.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            switch state {
            case .ready:
                self.clients[key] = c
            case .failed(_), .cancelled:
                self.clients[key] = nil
            default:
                break
            }
            let n = self.clients.count
            DispatchQueue.main.async { self.clientCount = n }
        }
        c.start(queue: netQ)
        receive(c)
    }

    // a laptop may ask for a mode ({"want":"camera"} or {"want":"body"}); reading also notices when it closes
    private func receive(_ c: NWConnection) {
        c.receiveMessage { [weak self] data, _, _, error in
            if let d = data, let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let want = obj["want"] as? String {
                DispatchQueue.main.async { self?.setMode(want) }
            }
            if error == nil { self?.receive(c) } else { c.cancel() }
        }
    }

    private func send(_ data: Data, binary: Bool, depth: Bool = false) {
        netQ.async {
            // pictures: if the Wi-Fi is behind, skip this one rather than build up a delay (depth maps are small and always go)
            if binary && !depth && self.pending > 2 { return }
            let meta = NWProtocolWebSocket.Metadata(opcode: binary ? .binary : .text)
            let ctx = NWConnection.ContentContext(identifier: binary ? "picture" : "body", metadata: [meta])
            for c in self.clients.values {
                if binary { self.pending += 1 }
                c.send(content: data, contentContext: ctx, isComplete: true, completion: .contentProcessed { [weak self] _ in
                    if binary { self?.netQ.async { self?.pending = max(0, (self?.pending ?? 1) - 1) } }
                })
            }
        }
    }

    // ---------------- helpers ----------------
    // the certificate the secure connection uses (made for this app; the laptop accepts it once)
    static func loadIdentity() -> SecIdentity? {
        guard let url = Bundle.main.url(forResource: "bodystream", withExtension: "p12"),
              let data = try? Data(contentsOf: url) else { return nil }
        var items: CFArray?
        let options = [kSecImportExportPassphrase as String: "bodystream"] as CFDictionary
        guard SecPKCS12Import(data as CFData, options, &items) == errSecSuccess,
              let list = items as? [[String: Any]],
              let first = list.first,
              let identity = first[kSecImportItemIdentity as String] else { return nil }
        return (identity as! SecIdentity)
    }

    // every IPv4 address this phone has, by network name (en0 = Wi-Fi, bridge… = its own hotspot)
    static func allAddresses() -> [String: String] {
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return [:] }
        defer { freeifaddrs(ifaddr) }
        var found: [String: String] = [:]
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let i = ptr.pointee
            guard let sa = i.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET) else { continue }
            let name = String(cString: i.ifa_name)
            guard name.hasPrefix("en") || name.hasPrefix("bridge") else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                found[name] = String(cString: host)
            }
        }
        return found
    }
    // the one address laptops should use right now: the hotspot's when a laptop is on it, else the Wi-Fi's
    static func currentAddress() -> (ip: String, via: String)? {
        let all = allAddresses()
        if let h = all.first(where: { $0.key.hasPrefix("bridge") })?.value { return (h, "hotspot") }
        if let w = all["en0"] { return (w, "Wi-Fi") }
        if let o = all.first(where: { $0.key.hasPrefix("en") })?.value { return (o, "network") }
        return nil
    }

    static func round3(_ v: Float) -> Double { (Double(v) * 1000).rounded() / 1000 }
    static func round4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }
}
