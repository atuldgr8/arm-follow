// Body Stream: Apple's body tracking (ARKit, helped by the LiDAR) sent live to Arm Follow over Wi-Fi.
// Two files: this one (the app and its screen) and Tracker.swift (tracking + sending).
// Setup steps are in README.md next to these files.

import SwiftUI
import RealityKit
import AVFoundation

// the app's screen stays upright (like the Camera app); the text turns by itself to match how the phone is held
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask { .portrait }
}

@main
struct BodyStreamApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some SwiftUI.Scene {   // SwiftUI's Scene (RealityKit has one too)
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @StateObject private var tracker = Tracker()

    // the address, status and mode switch
    private var info: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("BODY STREAM v8 (25 Oct 23:35) · type this into Arm Follow")   // the version: change it with every update, so you can see the new one is installed
                .font(.system(size: 13, weight: .medium, design: .monospaced))
            Text(tracker.address)
                .font(.system(size: 30, weight: .bold, design: .monospaced))
            Text(tracker.status)
                .font(.system(size: 13, design: .monospaced))
            Picker("Mode", selection: Binding(get: { tracker.mode }, set: { tracker.setMode($0) })) {
                Text("Body (Apple tracking)").tag("body")
                Text("Camera (ultra-wide)").tag("camera")
                Text("Camera + depth").tag("depth")
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 480)
        }
        .padding(14)
        .background(Color.black.opacity(0.6))
        .foregroundColor(.white)
        .cornerRadius(12)
        .padding(16)
        .padding(.top, 40)
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            CameraView(tracker: tracker).ignoresSafeArea()
            if tracker.mode == "camera" {
                PreviewView(session: tracker.camera.session).ignoresSafeArea()
            }
            if tracker.mode == "depth" {
                // two cameras at once: the ultra-wide picture, with the LiDAR's zone outlined
                ZStack {
                    Color.black
                    if let layer = tracker.previewLayer {
                        LayerView(layer: layer)
                            .aspectRatio(tracker.previewAspect, contentMode: .fit)
                            .overlay(GeometryReader { g in
                                Rectangle().stroke(Color.cyan, style: StrokeStyle(lineWidth: 3, dash: [10, 6]))
                                    .frame(width: g.size.width * tracker.previewZone.width, height: g.size.height * tracker.previewZone.height)
                                    .position(x: g.size.width / 2, y: g.size.height / 2)
                            })
                    }
                }
                .ignoresSafeArea()
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
            // the text, turned to read upright however the phone is held
            GeometryReader { geo in
                let sideways = abs(tracker.uiTurn) == 90
                info
                    .frame(width: sideways ? geo.size.height : geo.size.width, height: sideways ? geo.size.width : geo.size.height, alignment: .topLeading)
                    .rotationEffect(.degrees(tracker.uiTurn))
                    .position(x: geo.size.width / 2, y: geo.size.height / 2)
                    .animation(.easeInOut(duration: 0.25), value: tracker.uiTurn)
            }
            .ignoresSafeArea()
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

// depth mode: hosts Apple's live preview layer (wired to the ultra-wide), kept the right way up
struct LayerView: UIViewRepresentable {
    let layer: AVCaptureVideoPreviewLayer
    func makeUIView(context: Context) -> LayerHostView {
        let v = LayerHostView()
        v.backgroundColor = .black
        v.host(layer)
        return v
    }
    func updateUIView(_ uiView: LayerHostView, context: Context) { uiView.host(layer) }
}
final class LayerHostView: UIView {
    private weak var hosted: AVCaptureVideoPreviewLayer?
    func host(_ l: AVCaptureVideoPreviewLayer) {
        if hosted !== l { hosted?.removeFromSuperlayer(); layer.addSublayer(l); hosted = l }
        setNeedsLayout()
    }
    override func layoutSubviews() {
        super.layoutSubviews()
        guard let l = hosted else { return }
        l.frame = bounds
        if let c = l.connection {
            let o = window?.windowScene?.interfaceOrientation ?? .landscapeRight
            let angle: CGFloat = o == .landscapeLeft ? 180 : o == .portrait ? 90 : o == .portraitUpsideDown ? 270 : 0
            if c.isVideoRotationAngleSupported(angle) { c.videoRotationAngle = angle }
        }
    }
}
