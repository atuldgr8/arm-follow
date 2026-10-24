# Arm Follow v1

hi!

One shared body. P1 owns it and walks it. P2 possesses one of its arms (or both). If P2 doesn't walk along with P1, the arm is left behind: it falls off like a marionette with its strings cut, lies on the floor still twitching along with P2, and can't hold anything. When P2 catches up, invisible strings haul it back and it snaps into the shoulder. The task: walk to a cube and lift it with both hands.

Built from `prototypes/arm-follow-build.md` (v0.3), in three.js. Saved 22 Oct 2026, from the Arm Follow chat.


## v1.14 (25 Oct): steadier near the cube, solid plinths, see-through cube

From Atul's test of v1.13.1:

- **New defaults** (his picks): Feel at full smoothness (1.0), Quicker hands off, hand assist 0.85.
- **Hold my place while reaching:** within reach of the cube (or of the plinth while holding it), small shifts, leaning in and the camera's wobble are ignored and only your arms move. A deliberate step (about 12 cm of real floor) still moves you. Webcam and iPhone only.
- **Solid plinths:** you can't walk into a plinth or the cube on it; you slide along its sides.
- **See-through cube when held,** so you can see the plinth to set it down on.
- All three are switches (View section).

## v1.13.1 (25 Oct): standing still stays still

- The guess of where you stand wandered 1–2 cm (more in depth) even when you didn't move, and the walk gain doubled it, so the maquette drifted about constantly. Now a soft dead zone ignores wobbles under 2.5 cm (4 cm in depth); a real step still moves the body. Slider: Tracking → Standing still stays still (0 = off).
- On Atul's logs: the 1-second wobble while standing went from 8–17 mm to 1–7 mm in depth, and to 0 side to side.

## v1.13 (25 Oct): an iPhone as the tracker

- **Tracking → Tracker → iPhone (Body Stream app).** The new iPhone app in `iphone/` sends Apple's body tracking (real depth from the LiDAR, gravity-aligned) over Wi-Fi. Arms swung back read as back. Setup in `iphone/README.md`.
- The camera view shows the phone's picture with the skeleton. Each laptop chooses its own tracker (P1 iPhone, P2 webcam is fine).
- Tested here against a stand-in phone (a swinging arm, forward and back): followed both ways. Not yet run on a real iPhone.

## v1.12.2 (25 Oct): arms hang straight at rest

From Atul's second log of the night (Arms only, C920):

- **Arms leaned ~20° forward at rest.** The camera-tilt correction was applied to the arms too. The "tilt" is mostly the body model's own habit of reading an upright torso as leaning, and an arm hanging beside you looks straight down in the picture however the camera is tilted. Arms are no longer turned by it: at rest they now hang at 0°.
- **How much an arm points at the camera** now comes from your arm's remembered length (the longest it has looked lately), the standard single-camera method, instead of the body model's noisier length guess. An arm that looks nearly full length counts as flat.
- **Limits that remain (the camera, not the code):** one camera can barely tell forward from back. The body model leans toward "forward", and a hand behind your back is mostly hidden from it. Headsets (VR) or a second camera are the real fix.

## v1.12.1 (25 Oct): the jumping hands, fixed

Found by replaying Atul's log of 24 Oct, frame by frame:

- **The big one:** since v1.9 the arms are built from the picture, and the picture can't tell whether an elbow points toward the camera or away. A yes/no rule decided it from the body model's depth guess, and for an arm hanging or held sideways that guess hovers around zero, so the elbow and hand flipped about 25 cm forward and back every frame or two. The PiP and the Tracking Lab only show the flat picture, which is why they looked smooth. Now it's a dimmer instead of a switch, and depth gets its own calmer smoothing.
- **Upside-down bodies:** a deep bend or a head leaving the top of the picture sometimes made the body model read you upside down for a frame, flinging the whole body. Those frames are now skipped.
- **Half-seen arms** (hidden behind you, blurred) move only part of the way toward the body model's guess.
- On that log: the hands shake about 3× less, and big jumps (over 8 cm in one frame) went from about 30 per arm to 1–4.

## v1.12 (24 Oct): Arms only

**Arms only** (quick bar, or A): the body stands still in the middle of the room, nothing falls off, and there's nothing to pick up: just your arms, and P2's possessed arm when linked, to feel how the tracking moves. Three views (View section): **from your eyes, at your hands** (closest to VR), **facing you like a mirror**, or **from the side**. Press A again to go back.

## v1.11 (24 Oct)

- **Bending holds your place** (Tracking, on): while your torso leans forward (from about 12°, fully by 27°), your place on the floor holds where it was when you were last upright. Bending can't move your feet, but it hides and squashes the body in the picture and the guesses about where you are go wild (in Atul's log: up to 0.5 m forward/back and a 0.6 m sideways flip). Replaying that log, the place now stays put through every bend.
- **Camera tilt** (Tracking, on): a tilted camera (laptop lid leaned back, or a camera mounted high and angled down) made the body lean. People mostly stand upright, so the average lean of a standing torso is the camera's tilt: it's measured slowly while you're upright and taken off the body. Only the body is straightened; the picture isn't changed, so feet and everything else are tracked as before. Tested with a simulated camera at 1.8 m tilted 30° down: tilt measured as 30°, body upright, distances right. The stats line shows the lean and the camera tilt.
- **Raise both hands** (Tracking, on): hold both hands above your head for about a second: start measuring the floor; again: done; again (P1): START. A big cue on screen says what's next, with a bar that fills while you hold.
- **Rooms of different sizes, smaller room:** in the bigger room the patch now sits at the back of the measured floor (further from the camera = more of the body in the picture), not the middle.
- **Quicker hands** (Tracking, on): elbows, wrists and hands are smoothed less, so they keep up with fast moves.
- **First person near the cube** is steadier: it follows a calmed copy of the head and looks at a calmed target.
- Stats never run under the camera view; the stats line says whether MediaPipe runs on the GPU or fell back to the CPU.

## v1.10.2 fix (23 Oct, from Atul's log)

- **The maquette froze on the first frame** (and so the floor never grew while measuring): on a real laptop a new camera picture arrives on every screen frame, and the glide between pictures was timed from "now", so it restarted at 0% every frame. The main build found and fixed exactly this in V13.1 (time the glide from the frame the body was last drawn); now Arm Follow does the same. Found by replaying Atul's recorded tracking the way a real laptop runs it.
- Floors measured before v1.10 aren't reused (they judged distance differently): measure again.

## v1.10 fixes (23 Oct)

- **The body froze and calibration failed:** v1.9's bend-protection treated walking away from the camera (or one noisy frame) as bending and froze the body, sideways too after a floor had been measured, so the floor never grew while calibrating. It's gone.
- **Where you stand, from the body's shape (no legs needed):** the body model gives your body's 3D shape in metres; the app finds where that shape must stand for its picture to land where the camera saw you, using every visible point (head, shoulders, elbows, hips, knees). Bending, turning and reaching fit the same shape, so they no longer move the body. In a simulated test (with webcam-like noise) bending 52° and turning 57° moved it by under 1 cm. Feet, when in the picture and the floor was measured with this version, are used as well (floors measured before v1.10 are re-measured).
- **Where you stand is smoothed on its own,** calmer than the limbs, since the walk gain multiplies its wobble.
- **The camera view now draws the smoothed skeleton** the game uses (it used to draw the raw detection, so it always looked jittery). **Raw detection under the skeleton** (Tracking) shows the raw one faintly underneath, to compare.
- Stats line: "where you stand from: body shape / feet".

## v1.9 changes (tracking rebuilt on the gold standard)

- **Why it went haywire:** MediaPipe tracks the body in the picture very well (that's what the dancer demos show), but it doesn't say where you stand in the room; its 3D points are always centred on your hips. Arm Follow was guessing your distance from how long your torso looked, so bending (a shorter-looking torso) read as a jump backwards, multiplied by the walk gain.
- **Where you stand now comes from your feet** (superseded in v1.10: from the body's shape, feet as a bonus). Your feet are on the floor, so where they are in the picture says how far away you are (the same idea as single-camera distance estimation in research, e.g. Fei et al., ICCV 2021). Bending, leaning and reaching don't move your feet. This needs a measured floor (walk toward and away from the camera while calibrating); the stats line says "where you stand from: feet / torso / held". Without it: the torso's size, but held still while you bend.
- **Smoothing ported from the main build (V13.1):** every point is filtered in the picture, once per camera frame, then the body glides between camera frames at the screen's rate. The feel slider means the same as in the main build (default 0.5).
- **Arms come from the picture,** plus how far they point at the camera. A hand that leaves the picture (overhead, say) keeps its last direction for a moment instead of flailing.
- **Holding the cube:** held while your palms face each other, as if holding a box, overhead too. Let go by opening your hands outward or pulling them well apart.
- **P2's cue:** just P2's shadow on the floor (a soft one, like the body's own). Walk it under the body. A thread runs from the fallen arm to the body's shoulder (toggle).
- **The lying arm** follows P2 more strongly and sooner, lifts off the floor a little, and its fingers follow P2's hand.
- **The game is carry and drop:** pick the cube up and set it down on the other plinth (top marked in blue). An optional **warm-up** (Picking up) lifts the first cube above the waist first.
- **First person near the cube** (View, on): the view cuts to first person as you get close to the cube, back out while you carry it, and in again near the plinth to set it down on. The body fades while the camera moves through it.

## v1.8 changes (after the first real test)

- **The link:** much lighter and faster. Updates go as plain text over a channel that never waits for a lost message (old ones are useless anyway), settings travel only when they change, and P1's laptop no longer drops P2 after a short gap (1.5 s instead of 0.6 s). P2's laptop plays P1's world a moment behind (**P2's view runs behind by**, Spaces, 60 ms) and blends between updates, so it moves smoothly instead of in jumps. P2's own possessed arm is still drawn instantly. The stats line shows how many updates arrive per second and, on P1's laptop, how long ago P2's body last arrived.
- **Tracking feel:** less smoothing, and the slider's range moved (default 0.35). Limbs stay quick; the body's distance from the camera (the noisiest guess) is smoothed on its own.
- **Reaching toward the camera** (Tracking): an arm pointing at the camera looks short in the picture; knowing its real length tells how far it points at you. Old: the body model's own depth guess, as a toggle.
- **Who is followed** (camera view): the followed person is in colour and labelled; anyone else is grey, dashed and marked "ignored". If the locked person isn't matched, it says so. The lock is much more generous (leaning in to reach makes the torso look short, which used to lose P2), and if there's only one person in a camera, it's them.
- **Where P2 is** (Follow rule, on by default while the arm is off): a shadow ring on the floor where P2 is in the room, tied by a thread to the shoulder P2 drives; the thread is lit at P2's end. Walk your ring into the circle under the body and the arm comes back (the circle turns green when you're close enough). Both laptops see it.
- **Steps toward/away count** (Follow rule, 50%): leaning in to reach looks to a webcam like a step forward, which used to knock the arm off.
- **Hand assist** (Picking up, 0.6): near the cube, hands are drawn onto its sides and turned to face it; once held they stay on the sides. Letting go still uses where your hands really are. The grip now starts on **Both hands on the sides (sticky)**.
- **Prompts** under the meter: "both hands on the sides of the cube", "one hand on…", "HELD · lift it…", "P2: follow your thread back…".
- **Keep cubes in from the edges** (Floor, 45 cm): cubes stand that far inside your measured floor, so reaching for them stays in the camera.
- **The camera near the cube** follows a calmed copy of the body and is anchored on the cube, so the body's wobble isn't magnified.

## Files

- `index.html`: the page, the control panel and the visitor HUD.
- `track.js`: the settings; turns the webcam (body model, and the hand model if chosen), the demo people or the computer partner into P1 and P2.
- `sim.js`: the rules: the body, the follow rule, the arm's puppet states, the grips and the cube task.
- `scene.js`: draws it all in 3D: the room, the mannequin, hands with fingers, the strings, the three views.
- `floor.js`: measuring your real floor, and fitting the room to it.
- `net.js`: the 2-spaces link.
- `ui.js`: HUD, panel, keys, the camera + skeletons view, the log, and the main loop.

## Running it

Online (for two laptops): https://atuldgr8.github.io/arm-follow/

Locally: serve the folder (VS Code Live Server) and open `index.html` in Chrome. Serving is needed for the webcam and the 2-spaces link. Opening the file directly works for the demo.

**Demo people** (Tracking → Source): two made-up people who play the whole loop by themselves. P1 walks to the cube, P2 gets distracted on every other trip (the arm falls), hurries to catch up (it comes back), then they lift the cube together. Good for seeing every part with nobody in the room.

Switch **Source** to **Webcam (MediaPipe)** for real people. The **camera + skeletons** view (J) is on from the start: the live picture with the tracked points drawn on it, so you can see what the tracker sees.

## Starting

It opens on the **webcam**. (Demo people only when you choose them under Tracking → Source.) A **Getting ready** card walks both laptops through:

1. **Measure your floor**, on each laptop (P2 measures P2's): press **Calibrate**, walk to the front, back, left and right edges of the space you can use, press **Done**. A saved floor is reused automatically (**Measure again** to redo it); **Skip** uses the saved floor if there is one, else the walk-gain sliders.
2. **Two rooms of different sizes** (2 spaces, once both have measured): P1 picks **Map onto each other** or **Use the smaller room**. With the smaller room, the person in the bigger room gets walls (and a floor outline in their camera view).
3. **Step into the camera.** The biggest person in each camera is followed.
4. **START** (P1, once every step is done) locks onto those people: anyone else walking through is ignored. If nobody was in a camera at START, the first person to appear is locked onto.
5. **Walk onto the green ring.** Both walk to the middle of the floor they use (the ring in the room; P2 shows as an orange dot; the camera view marks the spot). Once both are there for a moment, it begins by itself.

**Setup** in the quick bar goes back to the card.

**Camera view:** the floor you use is outlined on the camera picture (dashed), once you've measured it walking toward and away from the camera.

## 2 spaces (main)

1. On both laptops, keep **2 spaces**.
2. On P1's laptop press **Host**: it shows a 4-letter code.
3. On P2's laptop type the code and press **Join**.

P1's laptop decides everything: the world, every setting, the view and the camera (P2 sees exactly P1's camera), and P2's tracking too. On P2's laptop the panel is greyed out except measuring its own floor, what its own camera needs (which camera, its field of view, mirroring) and **Disconnect**.

**Lag:** both laptops send about 33 updates a second, and P2's laptop draws P2's own possessed arm straight from P2's own tracking, so P2 sees their arm move instantly; everything else arrives from P1's laptop a moment later.

To test on one computer, tick **Same computer test** and use two browser tabs.

## Testing alone

- **Computer partner → plays P2:** you own the body. It walks after you, a little late and no faster than its top speed (a slider), so walking briskly leaves the arm behind and stopping lets it catch up. Its arms copy yours, late, so you can still work the possessed arm and try the grips.
- **Computer partner → plays P1:** you are the arm. It walks the body to the cube by itself; you follow and bring the arm.
- **Solo (S):** you are P1 and P2 at once. The arm never falls (there's no drift); handy for trying grips.

## The follow rule

Drift is how far the two of you have moved apart since the arm was last attached, on the floor only.
- 2 spaces: P1's movement − P2's movement (walk the same way, by the same amount).
- 1 space: how much the gap between you changed (keep the gap you started with).

Above the drift tolerance (0.5 m) the arm is left behind. Facing more than 60° differently (also measured since it was attached) leaves it behind too. It comes back when both are under 60% of their tolerance.

The **drift meter** at the top: the bar is the drift, the first tick is "comes back", the second is "left behind". The thin bar under it is turning. When the arm is lost the green zone shows how close you need to get.

## Puppet feel (all switchable under Follow rule)

- **Falling (Puppet fall):** loose at the elbow and wrist, swings, bounces once, settles. Off: a stiff, mechanical drop, for comparison.
- **Fingers curl** when lifeless, and twitch back to life after the snap.
- **Lying arm follows:** the shoulder end stays where it fell; the elbow and hand still follow P2's arm, laid flat on the floor, late (lag slider) and weakly (strength slider).
- **Twitches** when P2 moves a lot.
- **Coming back:** pulled up on invisible strings in jerks, dangling, a little too slow (time slider). Or **Glides back**, smooth and mechanical, for comparison.
- **Snap overshoot:** it snaps into the shoulder with a small springy overshoot.
- **Show strings:** thin lines up from the shoulder and wrist, only while lifeless or being pulled back.
- **Hangs limp on the shoulder** instead of falling off (toggle).

Colours: P1's arms are light grey, a possessed arm is vermilion (P2), a lifeless arm fades to dark grey.

## Picking up (the two-hand cube)

Both hands have to be on opposite sides of the cube. Four grips to compare:

- **Squeeze to hold:** held only while both palms press in. Ease off a little and it starts to slip down; let go and it drops.
- **Palms facing = grip:** palms touching and facing the cube lock it to the hands.
- **Just touching:** both hands touching is enough, no gesture.
- **Dwell 0.5 s:** the fallback: both hands on it for half a second and it sticks.

In every grip, **palms moving apart** lets go. A lifeless arm can't hold, and drops what it held.

**Done:** lift the cube so its bottom is above the body's waist, and hold it there for 2 s (HOLD bar). The cube vanishes and a new one appears somewhere else on the floor you can actually walk (the "New cubes appear within" sliders, in real metres).

**Hand tracking** (Tracking section):
- **Body model only:** 4 points per hand (wrist, index, pinky, thumb). Steady at a distance, palm direction rough.
- **Add the hand model:** 21 points per hand. Better palm direction, and it sees how open the hand is (the fingers on screen open and close with yours). It may drop out at 2–3 m; when it does, that hand falls back to the body model. The stats line shows which one each hand is using.

## Floor (calibration)

**New cubes appear** (toggle): **mostly left and right** (default: on the far side from where you stand, near the middle front to back, so you walk a lot sideways), or **anywhere you can reach**.

Each laptop measures its own floor. Press **Calibrate floor** (on the start card, in the Floor section, or C), walk to your front, back, left and right edges, then press it again. It's remembered on that laptop (**Forget floor** clears it).

- **The measured floor sets** (toggle): the walk gain (so your floor stretches to fill the room, up to 4×) + where cubes appear (always somewhere you can reach; the first one at the far end of your floor). Or only one of the two. Not measured: the walk gain slider and the area sliders, as before.
- **Rooms of different sizes** (2 spaces, toggle):
  - **Map each room onto the other:** P2's steps are scaled into P1's room. If P2's room is half as deep, one step of P2's counts as two of P1's.
  - **Both use the smaller room:** each person only uses a patch the size of the smaller room, in the middle of their own.
- **Edge warning:** near an edge, a banner names it (ahead = toward your camera), and P1 sees a grid wall fade in at that edge in the room, like a VR boundary. The floor's outline is always drawn.

## Views (V)

- **Behind the body** (default): over the right shoulder.
- **First person:** a VR preview, from the head.
- **Free orbit:** drag to look around.

**The view faces** (View section), to compare:
- **Always forward** (default): the view never turns. The body can twist, the room stays put.
- **Toward the cube:** a lock-on, like the Jaeger.
- **Wherever the body faces:** the view turns with the body, slowly.

**Near the cube, the camera** (toggle): as you get close (or while you hold it) the camera moves in to examine, like in a game: **up, looking down** (default), **to the side**, **in front, looking back at you**, or **stays put**. A slider sets how close. **See-through body** fades the torso, head and legs while it does, so your arms and the cube show through.

**Body may turn up to** (a slider): past this the body stops turning. 180° = no limit. A webcam only really sees you facing it, so a big turn is usually MediaPipe swapping your left and right side when you're side-on; sudden jumps of more than 120° are now ignored, and turning always goes the short way round.

## The panel

Calm and mono-type (DM Mono): white cards on an off-white panel, thin lines, small type. Each section keeps its colour as a dot by its name (Tracking blue, Spaces lilac, Floor mint, Who owns what orange, Follow rule lime, Lifeless arm pink, Picking up yellow, View coral), and the same colour shows on its slider knobs and switches. A **quick bar** at the top holds what you use every test: Camera + skeletons (J), Stats (D), View (V), Solo (S), Calibrate (C), Setup (back to the start card), Restart (R), Log (O). Settings that don't apply right now fold into one greyed line saying why. Hover the little **i** (or tap it) for an explanation; most switches and quick-bar buttons explain themselves on hover too. The panel remembers which sections you left open.

## The room

A plain white room. Only the content is in colour: the cobalt cube, P2's vermilion arm, the green ring.

## Keys

H panel · J camera + skeletons · V view · C calibrate floor · R restart · S solo · O log · D stats · F fullscreen

## Choices I made that the build instruction didn't settle (check these)

- **Walk gain** starts at 2 (1 real metre = 2 virtual metres).
- **The room:** first cube 2.5 m ahead of the start ring, on a 0.6 m plinth; the cube is 42 cm.
- **"Above the waist"** = the cube's bottom above the body's pelvis.
- **Turning** comes back under 60% of its tolerance, like drift.
- **Nobody in the arm** (P2 not linked or not tracked): the arm hangs limp and grey. When P2 appears it's pulled up on the strings.
- **Arm lengths** are fixed (a standard mannequin); tracking gives their direction. The torso and legs use P1's own proportions.
- **Ghost of P2** (View, off by default): a ring on the floor showing where P2 is compared to the body. Added so you can test whether P2 needs to see where to go.
- **Hand openness** (hand model) is shown on the fingers, but no grip requires an open hand yet.
- Left out, as decided: one-hand objects and the "hands needed: one" toggle.

## Tested / not tested

Tested in a browser, with the demo people and with a fake "webcam" person:
- The whole loop in every combination: falling and limp, puppet fall and stiff drop, strings and glide, all four grips, right / left / both arms, 1 space and 2 spaces.
- "Only possessed hands" with one possessed arm never grips (the panel says why).
- The 2-spaces link over the same-computer test: P2's body reaches P1's laptop, P2's laptop shows the world and gets the host's settings.
- The computer partner (plays P2): walking briskly leaves the arm behind, stopping lets it catch up.
- The palm direction and hand openness maths, on made-up hand points.

Not tested: a real webcam, real bodies, the hand model on real hands, two real laptops over PeerJS. Likely tuning points:
- `SET.touch` (touching distance) and the squeeze slack in `gripStep` (sim.js), because webcam depth is guessed from body size.
- `SET.tol` and `SET.turnTol`, as planned.
- The puppet numbers in `armStep` (sim.js): bounce (0.35), the string jolts, the snap spring.
