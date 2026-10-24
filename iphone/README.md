# Body Stream (iPhone → Arm Follow)

A tiny iPhone app: Apple's body tracking (ARKit, helped by the LiDAR on Pro iPhones) sends your skeleton live to Arm Follow over Wi-Fi. Unlike the webcam, it measures depth instead of guessing it, so an arm swung back reads as back, and it knows which way is down, so a tilted phone doesn't tilt the body.

Built 25 Oct 2026 in the Arm Follow chat. Not yet run on a real phone: the first build may need a small fix (send Claude the Xcode error text).

## What you need

- A Mac with Xcode (free from the App Store).
- An iPhone with an A12 chip or newer (iPhone XS and later; any Pro). The LiDAR on a Pro makes it better, but isn't required.
- A free Apple ID. A free account can install your own app on your own phone; it needs re-installing from Xcode every 7 days.

## Make the app (once, about 15 minutes)

1. **New project.** Xcode → File → New → Project → iOS → **App**. Name it `BodyStream`, Interface **SwiftUI**, Language **Swift**. Untick tests and storage. Save it anywhere.
2. **Replace the code.** In the project's folder, Xcode made `BodyStreamApp.swift` and `ContentView.swift`. Delete `ContentView.swift` (Move to Trash). Replace the contents of `BodyStreamApp.swift` with this folder's `BodyStream/BodyStreamApp.swift`.
3. **Add the tracker.** Drag `BodyStream/Tracker.swift` from this folder into the project's file list (tick "Copy items if needed" and the BodyStream target).
4. **Add the certificate.** Drag `BodyStream/bodystream.p12` in the same way. It lets the laptop connect securely; it was made just for this app (password `bodystream`) and protects nothing else.
5. **Permissions.** Click the project (top of the file list) → target **BodyStream** → **Info** tab → under Custom iOS Target Properties, add two rows with the + button:
   - `Privacy - Camera Usage Description`: `Tracks your body for Arm Follow`
   - `Privacy - Local Network Usage Description`: `Sends your body to Arm Follow on your laptop`
6. **Signing.** Same target → **Signing & Capabilities** → Team: your Apple ID (Add Account… if needed; it shows as "Personal Team"). If the Bundle Identifier is taken, add your name to it.
7. **Install.** Plug the iPhone in with a cable, pick it at the top of Xcode, press ▶ (Run).
   - First time only, on the phone: Settings → Privacy & Security → **Developer Mode** → on (it restarts).
   - If it says "Untrusted Developer": Settings → General → VPN & Device Management → your Apple ID → Trust.
   - Allow the camera and local network when the app asks.

## Use it

1. **Phone and laptop on the same Wi-Fi** (or the laptop on the phone's hotspot). College Wi-Fi often blocks devices from talking to each other; a hotspot always works.
2. **Place the phone** on its side (landscape), back camera facing you, about chest height, 2–4 m away, your whole body in the picture. The app shows its address in big letters, like `192.168.1.23:8443`.
3. **Once per laptop (the certificate):** in Chrome, open `https://` followed by that address (e.g. `https://192.168.1.23:8443`), choose **Advanced → Proceed**. The page then shows an error; that's fine, close it. If Chrome asks to allow access to devices on your local network, allow it.
4. **In Arm Follow:** Tracking → Tracker → **iPhone (Body Stream app)**, type the address, **Connect**. The camera view in the corner shows the phone's picture with your skeleton.

Each laptop chooses its own tracker, so P1 can use an iPhone while P2 uses a webcam, or both use phones.

## Limits

- One body per phone (Apple's body tracking follows one person).
- The phone gets warm; keep it charging for long sessions.
- Hands are rough: wrists and the palm's direction, not fingers.
