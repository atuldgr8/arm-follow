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
import RealityKit
import Network
import CoreImage
import ImageIO
import UIKit

final class Tracker: NSObject, ObservableObject, ARSessionDelegate {
    @Published var address = "starting…"
    @Published var status = "starting…"
    @Published var mode = "body"           // "body" (Apple's body tracking), "camera" (ultra-wide pictures) or "depth" (ultra-wide + LiDAR)
    @Published var preview: UIImage?       // depth mode: the picture on the phone's screen
    @Published var zone: CGSize = .zero    // depth mode: how much of the picture the LiDAR covers (fractions of width, height)
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
    private var sentN = 0, bodyN = 0, clientCount = 0
    private var lastStatus = Date()
    private weak var arSession: ARSession?
    private var bodyConfig: ARBodyTrackingConfiguration?
    let camera = CameraStreamer()
    private var camTimer: Timer?
    private var camSent = 0
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
        camera.onPreview = { [weak self] img in self?.preview = img }
        startServer()
        address = (Tracker.wifiAddress() ?? "no Wi-Fi") + ":\(port.rawValue)"
    }

    // ---------------- every camera frame ----------------
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        frameN += 1
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
            sentN += 1
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

        // the status line, once a second
        let now = Date()
        if now.timeIntervalSince(lastStatus) >= 1 {
            let secs = now.timeIntervalSince(lastStatus)
            var seen: String = "nobody in view: stand 2–4 m in front, whole body in the picture"
            if bodyN > 0 { seen = "tracking a body (\(Int(Double(bodyN) / secs))/s)" }
            var laptops: String = "no laptop connected yet"
            if clientCount == 1 { laptops = "1 laptop connected" } else if clientCount > 1 { laptops = "\(clientCount) laptops connected" }
            status = seen + " · " + laptops
            bodyN = 0; sentN = 0; lastStatus = now
        }
    }

    // ---------------- switching between body tracking and camera ----------------
    func setMode(_ m: String) {
        guard m != mode, ["body", "camera", "depth"].contains(m) else { return }
        let was = mode
        mode = m
        if m == "body" {
            camTimer?.invalidate(); camTimer = nil
            camera.stop()
            preview = nil
            if let s = arSession, let c = bodyConfig { s.run(c) }
            return
        }
        if was == "body" { arSession?.pause(); lines = [] }
        camera.start(depth: m == "depth")
        camSent = 0
        if camTimer == nil {
            camTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.cameraTick() }
        }
    }
    private func cameraTick() {
        let c: CameraStreamer = camera
        // how much of the ultra-wide picture the depth map covers (both are centred on nearly the same spot)
        var z = CGSize.zero
        if c.depthOn && c.fov > 0 && c.width > 0 && c.depthW > 0 {
            let tanDepth: Double = tan(Double(c.depthFov) * Double.pi / 360.0)
            let tanWide: Double = tan(Double(c.fov) * Double.pi / 360.0)
            let fx: Double = tanDepth / tanWide
            let depthAspect: Double = Double(c.depthH) / Double(c.depthW)
            let pictureAspect: Double = Double(c.height) / Double(c.width)
            let fy: Double = fx * depthAspect / pictureAspect
            z = CGSize(width: min(1.0, fx), height: min(1.0, fy))
        }
        zone = z
        var meta: [String: Any] = [:]
        meta["mode"] = mode
        meta["lens"] = c.lens
        meta["fov"] = Double(c.fov)
        meta["dfov"] = Double(c.depthFov)
        meta["W"] = c.width
        meta["H"] = c.height
        meta["dW"] = c.depthW
        meta["dH"] = c.depthH
        meta["depth"] = c.depthOn
        meta["problem"] = c.problem
        if let data = try? JSONSerialization.data(withJSONObject: meta) { send(data, binary: false) }
        var laptops: String = "no laptop connected yet"
        if clientCount == 1 { laptops = "1 laptop connected" } else if clientCount > 1 { laptops = "\(clientCount) laptops connected" }
        var what: String = c.problem
        if what.isEmpty {
            what = "\(c.lens), \(Int(c.fov))°"
            if c.depthOn { what += " · depth \(c.depthW)×\(c.depthH)" }
        }
        status = what + " · sending \(camSent)/s · " + laptops
        camSent = 0
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        status = "Tracking stopped: \(error.localizedDescription)"
    }

    // ---------------- the server (secure WebSocket) ----------------
    private func startServer() {
        let tls = NWProtocolTLS.Options()
        if let identity = Tracker.loadIdentity(), let secIdentity = sec_identity_create(identity) {
            sec_protocol_options_set_local_identity(tls.securityProtocolOptions, secIdentity)
        } else {
            status = "bodystream.p12 is missing from the app (see README, step 4)"
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
                if case .failed(let e) = state {
                    DispatchQueue.main.async { self?.status = "Server failed: \(e)" }
                }
            }
            l.start(queue: netQ)
            listener = l
        } catch {
            status = "Server error: \(error.localizedDescription)"
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

    // this phone's address on the Wi-Fi (or on its own hotspot)
    static func wifiAddress() -> String? {
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return nil }
        defer { freeifaddrs(ifaddr) }
        var found: [String: String] = [:]
        for ptr in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let i = ptr.pointee
            guard let sa = i.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET) else { continue }
            let name = String(cString: i.ifa_name)
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                found[name] = String(cString: host)
            }
        }
        if let wifi = found["en0"] { return wifi }
        if let hotspot = found.first(where: { $0.key.hasPrefix("bridge") })?.value { return hotspot }
        return found.first(where: { $0.key.hasPrefix("en") })?.value
    }

    static func round3(_ v: Float) -> Double { (Double(v) * 1000).rounded() / 1000 }
    static func round4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }
}
