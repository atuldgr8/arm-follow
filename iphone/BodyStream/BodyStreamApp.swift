// Body Stream: Apple's body tracking (ARKit, helped by the LiDAR) sent live to Arm Follow over Wi-Fi.
// Two files: this one (the app and its screen) and Tracker.swift (tracking + sending).
// Setup steps are in README.md next to these files.

import SwiftUI
import RealityKit
import AVFoundation

@main
struct BodyStreamApp: App {
    var body: some SwiftUI.Scene {   // SwiftUI's Scene (RealityKit has one too)
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @StateObject private var tracker = Tracker()

    var body: some View {
        ZStack(alignment: .topLeading) {
            CameraView(tracker: tracker).ignoresSafeArea()
            if tracker.mode == "camera" {
                PreviewView(session: tracker.camera.session).ignoresSafeArea()
            }
            // the tracked skeleton, drawn over the camera
            Canvas { ctx, _ in
                var path = Path()
                var i = 0
                while i + 1 < tracker.lines.count {
                    path.move(to: tracker.lines[i]); path.addLine(to: tracker.lines[i + 1]); i += 2
                }
                ctx.stroke(path, with: .color(.yellow), style: StrokeStyle(lineWidth: 5, lineCap: .round))
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 6) {
                Text("BODY STREAM · type this into Arm Follow")
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                Text(tracker.address)
                    .font(.system(size: 30, weight: .bold, design: .monospaced))
                Text(tracker.status)
                    .font(.system(size: 13, design: .monospaced))
                Picker("Mode", selection: Binding(get: { tracker.mode }, set: { tracker.setMode($0) })) {
                    Text("Body (Apple tracking)").tag("body")
                    Text("Camera (ultra-wide)").tag("camera")
                }
                .pickerStyle(.segmented)
                .frame(maxWidth: 360)
            }
            .padding(14)
            .background(Color.black.opacity(0.6))
            .foregroundColor(.white)
            .cornerRadius(12)
            .padding(16)
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }   // the screen stays on
    }
}

// the phone's camera picture, full screen (the tracking runs on its session)
struct CameraView: UIViewRepresentable {
    let tracker: Tracker
    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
        tracker.view = view
        DispatchQueue.main.async { tracker.start(session: view.session) }   // after the screen is drawn (SwiftUI warns otherwise)
        return view
    }
    func updateUIView(_ uiView: ARView, context: Context) {}
}

// camera mode: what the ultra-wide lens sees (the laptop gets the same pictures)
struct PreviewView: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> PreviewUIView {
        let v = PreviewUIView()
        v.preview.session = session
        v.preview.videoGravity = .resizeAspect
        v.backgroundColor = .black
        return v
    }
    func updateUIView(_ uiView: PreviewUIView, context: Context) {}
}
final class PreviewUIView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    override func layoutSubviews() {
        super.layoutSubviews()
        // keep the preview the right way up for the phone held on its side
        if let c = preview.connection {
            let o = window?.windowScene?.interfaceOrientation ?? .landscapeRight
            let angle: CGFloat = o == .landscapeLeft ? 180 : o == .portrait ? 90 : o == .portraitUpsideDown ? 270 : 0
            if c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
        }
    }
}
