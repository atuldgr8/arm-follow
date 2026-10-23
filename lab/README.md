# Tracking Lab v1

Every smoothing method run side by side on exactly the same movement, so "smooth enough" becomes something you can see and measure. Built 24 Oct 2026 in the Arm Follow chat, after the faculty review ("nail the tracking first; smooth the jagged curve").

Online: https://atuldgr8.github.io/arm-follow/lab/

## Inputs

- **Test motion:** a point that stands still, draws a slow figure-eight, stands still, swipes fast, stands still (every 8 s), with webcam-like shake added (slider). The true path is dashed, so each method's error can be measured exactly.
- **Webcam, body model:** MediaPipe's 33 points (what Arm Follow uses).
- **Webcam, hand model:** 21 points per hand (two hands; the one further left in the picture is hand 1).
- **Webcam, body + hands:** both at once (heavier).
- **Kinect:** through the Kinectron 0.4.0 app (Windows, Kinect v2). Type its IP and press Connect. From the online page only `127.0.0.1` (the same computer) works; for a Kinect on another computer, download the folder and open it locally. The Kinectron client (MIT licence, see `KINECTRON-LICENSE.txt`) is included.
- **Recording:** a lab recording (Record button) or an Arm Follow log (O in Arm Follow keeps its last 20 s of tracking). It loops, so you can change methods and settings on exactly the same movement.

## Methods

- **Raw:** untouched.
- **Simple average:** the mean of the last few samples.
- **One Euro:** calm when still, quick when moving (Casiez et al. 2012). Starts on the main build's middle settings (1.0 Hz, 0.0063).
- **Kalman (predictive):** follows position and speed; "looks ahead" can make up for its own lag, but amplifies shake.
- **Delay + curve:** waits, then draws a smooth curve through the samples on both sides. The smoothest, always that much late.

Each has its own sliders and can be switched on or off. **Skeleton drawn with** picks which one draws the skeleton; the raw one can be shown faintly underneath.

## What you see

- The skeleton over the camera (or a blank frame for the Kinect and recordings), with the graphed point circled.
- Three graphs of that point over the last few seconds: left–right, up–down (picture pixels) and depth (millimetres, from the body model's 3D guess or the Kinect), one line per method.
- **Numbers** for that point over the last 4 s: **shake when still** (lower = steadier), **shake in depth**, **lag** (how many ms later than raw it follows the same path; needs movement), and, for the test motion, **off by** (average distance from the true path).

How to read it: stand still and look at the shake column; then move (wave, reach) and look at the lag column and the graphs. The best method is steady when you're still and keeps up when you move.

## First finding (offline, test motion at 30 frames a second)

One Euro with "quick when moving" at **0.02** (instead of the main build's 0.0063) was as steady when still (0.72 vs 0.69 px of shake) and about **half as far off while moving** (12 vs 21 px). Kalman's look-ahead added shake for little gain on this motion; it starts at 0. To be confirmed on real movement in the lab.

## Copy settings

Copies every method's settings, to paste back to Claude, so the winner goes into Arm Follow (and later Unity).
