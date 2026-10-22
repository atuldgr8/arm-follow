# Arm Follow v1

hi!

One shared body. P1 owns it and walks it. P2 possesses one of its arms (or both). If P2 doesn't walk along with P1, the arm is left behind: it falls off like a marionette with its strings cut, lies on the floor still twitching along with P2, and can't hold anything. When P2 catches up, invisible strings haul it back and it snaps into the shoulder. The task: walk to a cube and lift it with both hands.

Built from `prototypes/arm-follow-build.md` (v0.3), in three.js. Saved 22 Oct 2026, from the Arm Follow chat.

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

Colours: P1's arms are warm white, a possessed arm is vermilion (P2), a lifeless arm fades to grey-brown.

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

Playful colour blocks: each section is its own loud card (Tracking sky blue, Spaces lilac, Floor mint, Who owns what orange, Follow rule lime, Lifeless arm pink, Picking up yellow, View coral), with round type, pill buttons and switches. A **quick bar** at the top holds what you use every test: Camera + skeletons (J), Stats (D), View (V), Solo (S), Calibrate (C), Setup (back to the start card), Restart (R), Log (O). Settings that don't apply right now fold into one greyed line saying why. Hover the little **i** (or tap it) for an explanation; most switches and quick-bar buttons explain themselves on hover too. The panel remembers which sections you left open.

## The room

A Barragán-ish courtyard: plaster walls in loud colours (pink at the back with an orange plane overlapping it, lilac on the left, yellow on the right), a pale stone floor in big slabs, open sky. The cube is cobalt, the plinth white plaster, the body warm white; a possessed arm is vermilion (P2).

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
