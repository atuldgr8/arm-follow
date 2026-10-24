// Body Stream: Apple's body tracking (ARKit, helped by the LiDAR) sent live to Arm Follow over Wi-Fi.
// Two files: this one (the app and its screen) and Tracker.swift (tracking + sending).
// Setup steps are in README.md next to these files.

import SwiftUI
import RealityKit

@main
struct BodyStreamApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @StateObject private var tracker = Tracker()

    var body: some View {
        ZStack(alignment: .topLeading) {
            CameraView(tracker: tracker).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 6) {
                Text("BODY STREAM · type this into Arm Follow")
                    .font(.system(size: 13, weight: .medium, design: .monospaced))
                Text(tracker.address)
                    .font(.system(size: 30, weight: .bold, design: .monospaced))
                Text(tracker.status)
                    .font(.system(size: 13, design: .monospaced))
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
        tracker.start(session: view.session)
        return view
    }
    func updateUIView(_ uiView: ARView, context: Context) {}
}
