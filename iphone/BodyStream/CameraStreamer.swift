// Camera mode: the phone as a wireless webcam (like DroidCam), using the ULTRA-WIDE lens, so a whole body
// fits in the picture from close by. The laptop runs MediaPipe on these pictures (Arm Follow: Tracker →
// iPhone camera). Apple's own body tracking only works with the main lens, so this mode has no ARKit skeleton.

import AVFoundation
import CoreImage
import ImageIO
import UIKit

final class CameraStreamer: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()
    var onJPEG: ((Data) -> Void)?          // each picture, ready to send
    private(set) var fov: Float = 0         // horizontal field of view in degrees (the laptop uses it to judge distance)
    private(set) var lens = "none"
    private(set) var width = 0, height = 0
    private let q = DispatchQueue(label: "bodystream.camera")
    private let ci = CIContext()
    private var configured = false

    func start() {
        q.async {
            if !self.configured { self.configure() }
            if !self.session.isRunning { self.session.startRunning() }
        }
    }

    func stop() {
        q.async { if self.session.isRunning { self.session.stopRunning() } }
    }

    private func configure() {
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        let device = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
        guard let d = device, let input = try? AVCaptureDeviceInput(device: d), session.canAddInput(input) else {
            session.commitConfiguration(); return
        }
        lens = d.deviceType == .builtInUltraWideCamera ? "ultra-wide" : "wide"
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

    // every camera picture: shrink to 960 px wide and send as a JPEG (the laptop's MediaPipe shrinks it further anyway)
    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let img = CIImage(cvPixelBuffer: pixels)
        let k = 960.0 / max(1, img.extent.width)
        let small = img.transformed(by: CGAffineTransform(scaleX: k, y: k))
        width = Int(small.extent.width); height = Int(small.extent.height)
        let opts = [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.6]
        if let jpeg = ci.jpegRepresentation(of: small, colorSpace: CGColorSpaceCreateDeviceRGB(), options: opts) {
            onJPEG?(jpeg)
        }
    }
}
