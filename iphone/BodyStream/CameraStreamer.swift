// Camera modes: the phone as a wireless webcam (like DroidCam), using the ULTRA-WIDE lens, so a whole body fits
// in the picture from close by. The laptop runs MediaPipe on these pictures.
//   camera: just the ultra-wide pictures.
//   depth:  the ultra-wide pictures AND the LiDAR's depth map at the same time (two cameras at once, Apple's
//           "multi-cam"). The LiDAR only sees about as wide as the main lens, so depth covers the middle of
//           the ultra-wide picture; the laptop uses real distances for the joints in that zone.
// Apple's own body tracking only works with the main lens, so these modes have no ARKit skeleton.

import AVFoundation
import CoreImage
import ImageIO
import UIKit

final class CameraStreamer: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureDepthDataOutputDelegate {
    let session = AVCaptureSession()              // camera mode (one lens)
    private var multi: AVCaptureMultiCamSession?  // depth mode (ultra-wide + LiDAR together)
    var onJPEG: ((Data) -> Void)?                 // each picture, ready to send
    var onDepth: ((Data) -> Void)?                // each depth map, ready to send ("DPTH", width, height, then millimetres)
    var onPreview: ((UIImage) -> Void)?           // depth mode: the picture for the phone's own screen
    private(set) var fov: Float = 0               // the ultra-wide's horizontal field of view, degrees
    private(set) var depthFov: Float = 0          // the LiDAR depth map's horizontal field of view, degrees
    private(set) var lens = "none"
    private(set) var width = 0, height = 0        // the pictures sent
    private(set) var depthW = 0, depthH = 0       // the depth maps sent
    private(set) var depthOn = false
    private(set) var problem = ""                 // why depth mode couldn't start, if it couldn't
    private let q = DispatchQueue(label: "bodystream.camera")
    private let dq = DispatchQueue(label: "bodystream.depth")
    private let ci = CIContext()
    private var configured = false
    private var frameN = 0, depthN = 0

    struct Fail: Error { let why: String }

    // WHICH WAY UP. The camera sensor always delivers its picture one fixed way round (landscape). The pictures
    // (and depth maps) are turned to match how the phone is held, so the phone's screen and the laptop's MediaPipe
    // always see people upright. Face up / face down keep the last turn.
    private(set) var orient: CGImagePropertyOrientation = .up
    private(set) var sensorW = 0, sensorH = 0     // the picture as the sensor gives it, before turning
    private var orientObs: NSObjectProtocol?
    var sideways: Bool { orient == .right || orient == .left }   // phone held upright: the picture is turned a quarter

    override init() {
        super.init()
        DispatchQueue.main.async {
            UIDevice.current.beginGeneratingDeviceOrientationNotifications()
            let update: () -> Void = { [weak self] in
                switch UIDevice.current.orientation {
                case .portrait: self?.orient = .right
                case .portraitUpsideDown: self?.orient = .left
                case .landscapeLeft: self?.orient = .up       // home side on the right: the sensor's own way round
                case .landscapeRight: self?.orient = .down
                default: break
                }
            }
            update()
            self.orientObs = NotificationCenter.default.addObserver(forName: UIDevice.orientationDidChangeNotification, object: nil, queue: .main) { _ in update() }
        }
    }

    // a depth map (w × h, row by row) turned the same way as the picture
    static func turn(_ a: [UInt16], _ w: Int, _ h: Int, _ o: CGImagePropertyOrientation) -> ([UInt16], Int, Int) {
        switch o {
        case .down:
            return (Array(a.reversed()), w, h)
        case .right:   // a quarter turn clockwise
            var b = [UInt16](repeating: 0, count: w * h)
            for y in 0..<h { for x in 0..<w { b[x * h + (h - 1 - y)] = a[y * w + x] } }
            return (b, h, w)
        case .left:    // a quarter turn anticlockwise
            var b = [UInt16](repeating: 0, count: w * h)
            for y in 0..<h { for x in 0..<w { b[(w - 1 - x) * h + y] = a[y * w + x] } }
            return (b, h, w)
        default:
            return (a, w, h)
        }
    }

    func start(depth: Bool) {
        q.async {
            self.stopAll()
            self.problem = ""
            if depth { self.startMulti() } else {
                if !self.configured { self.configure() }
                self.session.startRunning()
                self.lens = "ultra-wide"
            }
        }
    }

    func stop() { q.async { self.stopAll() } }

    private func stopAll() {
        if session.isRunning { session.stopRunning() }
        if let m = multi { m.stopRunning(); multi = nil }
        depthOn = false
    }

    // ---------------- camera mode: one lens ----------------
    private func configure() {
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        let device = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
        guard let d = device, let input = try? AVCaptureDeviceInput(device: d), session.canAddInput(input) else {
            session.commitConfiguration(); return
        }
        session.addInput(input)
        let out = AVCaptureVideoDataOutput()
        out.alwaysDiscardsLateVideoFrames = true   // never queue up old pictures: always the newest
        out.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        out.setSampleBufferDelegate(self, queue: q)
        if session.canAddOutput(out) { session.addOutput(out) }
        session.commitConfiguration()
        fov = d.activeFormat.videoFieldOfView
        configured = true
    }

    // ---------------- depth mode: ultra-wide + LiDAR at once ----------------
    private func startMulti() {
        do {
            guard AVCaptureMultiCamSession.isMultiCamSupported else { throw Fail(why: "this iPhone can't run two cameras at once") }
            guard let uw = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) else { throw Fail(why: "no ultra-wide lens") }
            guard let lidar = AVCaptureDevice.default(.builtInLiDARDepthCamera, for: .video, position: .back) else { throw Fail(why: "no LiDAR on this iPhone") }
            let dims = { (f: AVCaptureDevice.Format) in CMVideoFormatDescriptionGetDimensions(f.formatDescription) }
            // formats that can run alongside another camera: the smallest ultra-wide picture of at least 1280 wide,
            // and the smallest LiDAR picture that comes with depth (its depth map is what we want)
            guard let uf = uw.formats.filter({ $0.isMultiCamSupported && dims($0).width >= 1280 }).min(by: { dims($0).width < dims($1).width }) else { throw Fail(why: "no ultra-wide format for two cameras") }
            guard let lf = lidar.formats.filter({ $0.isMultiCamSupported && !$0.supportedDepthDataFormats.isEmpty }).min(by: { dims($0).width < dims($1).width }) else { throw Fail(why: "no LiDAR format for two cameras") }
            try uw.lockForConfiguration(); uw.activeFormat = uf; uw.unlockForConfiguration()
            try lidar.lockForConfiguration()
            lidar.activeFormat = lf
            let depthFormats = lf.supportedDepthDataFormats.filter {
                let t = CMFormatDescriptionGetMediaSubType($0.formatDescription)
                return t == kCVPixelFormatType_DepthFloat32 || t == kCVPixelFormatType_DepthFloat16
            }
            if let df = depthFormats.max(by: { dims($0).width < dims($1).width }) { lidar.activeDepthDataFormat = df }
            lidar.unlockForConfiguration()

            let m = AVCaptureMultiCamSession()
            m.beginConfiguration()
            let uwIn = try AVCaptureDeviceInput(device: uw)
            let liIn = try AVCaptureDeviceInput(device: lidar)
            guard m.canAddInput(uwIn), m.canAddInput(liIn) else { m.commitConfiguration(); throw Fail(why: "couldn't add both cameras") }
            m.addInputWithNoConnections(uwIn)
            m.addInputWithNoConnections(liIn)
            let vOut = AVCaptureVideoDataOutput()
            vOut.alwaysDiscardsLateVideoFrames = true
            vOut.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            vOut.setSampleBufferDelegate(self, queue: q)
            let dOut = AVCaptureDepthDataOutput()
            dOut.isFilteringEnabled = true          // Apple's smoothing of the depth map (fills small holes)
            dOut.alwaysDiscardsLateDepthData = true
            dOut.setDelegate(self, callbackQueue: dq)
            guard m.canAddOutput(vOut), m.canAddOutput(dOut) else { m.commitConfiguration(); throw Fail(why: "couldn't add the outputs") }
            m.addOutputWithNoConnections(vOut)
            m.addOutputWithNoConnections(dOut)
            guard let vPort = uwIn.ports(for: .video, sourceDeviceType: uw.deviceType, sourceDevicePosition: .back).first,
                  let dPort = liIn.ports(for: .depthData, sourceDeviceType: lidar.deviceType, sourceDevicePosition: .back).first else {
                m.commitConfiguration(); throw Fail(why: "couldn't find the camera ports")
            }
            let vc = AVCaptureConnection(inputPorts: [vPort], output: vOut)
            let dc = AVCaptureConnection(inputPorts: [dPort], output: dOut)
            guard m.canAddConnection(vc), m.canAddConnection(dc) else { m.commitConfiguration(); throw Fail(why: "couldn't connect both cameras") }
            m.addConnection(vc)
            m.addConnection(dc)
            m.commitConfiguration()
            if m.hardwareCost > 1.0 { throw Fail(why: "too much for the phone at once") }
            fov = uw.activeFormat.videoFieldOfView
            depthFov = lidar.activeFormat.videoFieldOfView
            lens = "ultra-wide + LiDAR"
            multi = m
            depthOn = true
            m.startRunning()
        } catch let f as Fail {
            problem = "depth mode: " + f.why
        } catch {
            problem = "depth mode: \(error.localizedDescription)"
        }
    }

    // every picture: shrink to 960 px wide and send as a JPEG (the laptop's MediaPipe shrinks it further anyway)
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        frameN += 1
        let raw = CIImage(cvPixelBuffer: pixels)
        sensorW = Int(raw.extent.width); sensorH = Int(raw.extent.height)
        let img = raw.oriented(orient)   // turned to match how the phone is held
        let k = 960.0 / max(1, max(img.extent.width, img.extent.height))
        let scaled = img.transformed(by: CGAffineTransform(scaleX: k, y: k))
        let small = scaled.transformed(by: CGAffineTransform(translationX: -scaled.extent.origin.x, y: -scaled.extent.origin.y))
        width = Int(small.extent.width); height = Int(small.extent.height)
        let opts = [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.6]
        if let jpeg = ci.jpegRepresentation(of: small, colorSpace: CGColorSpaceCreateDeviceRGB(), options: opts) {
            onJPEG?(jpeg)
        }
        // depth mode has no live preview layer (two cameras), so the phone's screen shows these pictures
        if depthOn && frameN % 3 == 0, let cg = ci.createCGImage(small, from: small.extent) {
            let ui = UIImage(cgImage: cg)
            DispatchQueue.main.async { self.onPreview?(ui) }
        }
    }

    // every other depth map (about 15 a second): halved, in whole millimetres, 0 = no reading
    func depthDataOutput(_ output: AVCaptureDepthDataOutput, didOutput depthData: AVDepthData, timestamp: CMTime, connection: AVCaptureConnection) {
        depthN += 1
        if depthN % 2 != 0 { return }
        let d = depthData.depthDataType == kCVPixelFormatType_DepthFloat32 ? depthData : depthData.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
        let pb = d.depthDataMap
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pb) else { return }
        let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb), row = CVPixelBufferGetBytesPerRow(pb)
        let step = w > 200 ? 2 : 1
        let ow = w / step, oh = h / step
        var mm = [UInt16](repeating: 0, count: ow * oh)
        for y in 0..<oh {
            let line = base.advanced(by: y * step * row).assumingMemoryBound(to: Float32.self)
            for x in 0..<ow {
                let v = line[x * step]
                if v.isFinite && v > 0 { mm[y * ow + x] = UInt16(min(65535, v * 1000)) }
            }
        }
        let (turned, tw, th) = CameraStreamer.turn(mm, ow, oh, orient)   // the same way up as the picture
        mm = turned
        var out = Data("DPTH".utf8)
        var w16 = UInt16(tw).littleEndian, h16 = UInt16(th).littleEndian
        withUnsafeBytes(of: &w16) { out.append(contentsOf: $0) }
        withUnsafeBytes(of: &h16) { out.append(contentsOf: $0) }
        mm.withUnsafeBytes { out.append(contentsOf: $0) }   // the phone is little-endian, as the laptop reads it
        depthW = tw; depthH = th
        onDepth?(out)
    }
}
