## 11. Master impact-frame table (copy into manifest.json)

| Unit | Clip | Length (f) | Impact frame | impactTime (s) |
|---|---|---|---|---|
| Pawn | attack_a | 40 | 17 | 0.567 |
| Pawn | attack_b | 50 | 28 | 0.933 |
| King | attack_a | 54 | 22 | 0.733 |
| King | attack_b | 70 | 46 | 1.533 |
| Queen | attack_a | 48 | 31 | 1.033 |
| Queen | attack_b | 56 | 28 | 0.933 |
| Knight | attack_a | 50 | 32 | 1.067 |
| Knight | attack_b | 60 | 22 | 0.733 |
| Bishop | attack_a | 46 | 27 | 0.900 |
| Bishop | attack_b | 70 | on chakram arrival | event-driven |
| Rook | attack_a | 80 | 50 | 1.667 |
| Rook | attack_b | 64 | 34 | 1.133 |
| Rook | attack_b_vs_elephant | 100 | 70 | 2.333 |

If you re-time a clip in Blender, re-measure. A wrong impact frame = spark and sound fire while the weapon is still in the air — the most visible bug in the game.

### Strike distance per attack (attacker root → victim root, metres)
| Attacker | vs small | vs medium | vs large |
|---|---|---|---|
| Pawn (spear) | 1.6 | 2.0 | 2.6 |
| King (khanda) | 1.2 | 1.8 | 2.4 |
| Queen | 1.1 | leap (0 — lands on/at mount) | leap |
| Knight | 2.2 | drive-by lateral 1.6 | drive-by 2.4 |
| Bishop | lance 2.6 / chakram: thrown from origin | same | same |
| Rook | 2.6 | 2.8 | 3.2 (clash: tusk to tusk) |

---

## 12. Procedural fallbacks (when a clip is missing) — Gemini implements

The game must stay fully playable and readable with **zero** animation clips. Each fallback is driven by the keyframe JSON (Section 13.2) applied to whole-body transforms and, where bones exist, to named bones.

| Clip | Fallback |
|---|---|
| idle | Root Y bob 1 cm sine (period by weight: 3 s light, 6 s heavy) + Spine pitch ±2° |
| walk / run | Root bob = abs(sin(phase)) × 3 cm, root roll ±2° (camel ±6°), forward lean 5°/12° |
| attack_a / b | 3-key lunge: back 0.3 m (anticipation frames) → forward 0.8 m (strike) → return. Pitch −10° → +15° → 0 |
| hit | Root pushed back 0.2 m + pitch −15° in 3 f, recover 9 f |
| death | Rotate root about the foot pivot to 90° (fall away from attacker) over the death length, ease-in; then dissolve |
| kneel | Root Y −0.5 m, pitch +20° |
| victory | Root jump 0.3 m twice |
| knight leap | Always procedural (Section 4.3) — real or fallback |
| chakram | Always procedural (Section 5.5) |

---

## 13. Code — ProceduralAnimator (Route C)

### 13.1 Concept
Clips (AnimationMixer) drive the skeleton. **After** `mixer.update()`, the ProceduralAnimator adds offsets: secondary motion chains (cape, tail, trunk, ears, mane), look-at, leaps, throws, squash, flinch. Everything uses **scaled** dt.

### 13.2 Keyframe JSON format (for fallback clips and procedural one-shots)
```json
{
  "pawn.attack_a.fallback": {
    "length": 40, "impactFrame": 17,
    "tracks": {
      "root.position.z": [[0,0],[6,-0.3,"easeOut"],[17,0.8,"snap"],[24,0.8],[40,0,"ease"]],
      "root.rotation.x": [[0,0],[6,-10,"easeOut"],[17,15,"snap"],[40,0,"ease"]],
      "bone:Spine2.rotation.y": [[0,0],[6,25],[17,-25,"snap"],[40,0,"ease"]]
    },
    "events": [[6,"sfx:armor_rattle"],[14,"sfx:spear_whoosh"],[17,"impact"]]
  }
}
```
Positions in metres (local, +Z = toward victim), rotations in degrees. Ease names: `linear | ease | easeIn | easeOut | snap | hold`.

### 13.3 Keyframe player
```ts
// src/units/KeyframePlayer.ts
import * as THREE from 'three';
type Key = [number, number, string?];
type Def = { length: number; impactFrame?: number; tracks: Record<string, Key[]>; events?: [number, string][] };

const EASE: Record<string, (t: number) => number> = {
  linear: t => t,
  ease: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeIn: t => t * t * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  snap: t => Math.pow(t, 4),                    // slow start, whip-fast finish (strikes)
  hold: () => 0,
};
const D2R = Math.PI / 180;

export class KeyframePlayer {
  private frame = 0; private firedEvents = new Set<number>();
  private base = new Map<string, number>();
  constructor(private root: THREE.Object3D, private def: Def,
              private onEvent: (name: string) => void, private fps = 30) {
    for (const path of Object.keys(def.tracks)) this.base.set(path, this.read(path));
  }
  get done() { return this.frame >= this.def.length; }

  update(scaledDt: number) {
    this.frame = Math.min(this.def.length, this.frame + scaledDt * this.fps);
    for (const [path, keys] of Object.entries(this.def.tracks)) this.write(path, this.base.get(path)! + this.sample(keys));
    this.def.events?.forEach(([f, name], i) => {
      if (this.frame >= f && !this.firedEvents.has(i)) { this.firedEvents.add(i); this.onEvent(name); }
    });
  }
  private sample(keys: Key[]): number {
    if (this.frame <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [f1, v1, ease = 'ease'] = keys[i]; const [f0, v0] = keys[i - 1];
      if (this.frame <= f1) return v0 + (v1 - v0) * EASE[ease]((this.frame - f0) / (f1 - f0));
    }
    return keys[keys.length - 1][1];
  }
  private target(path: string): [THREE.Object3D | undefined, string, string] {
    const parts = path.split('.');               // "root.position.z" | "bone:Spine2.rotation.y"
    const obj = parts[0] === 'root' ? this.root : this.root.getObjectByName(parts[0].slice(5));
    return [obj, parts[1], parts[2]];
  }
  private read(path: string): number {
    const [o, prop, axis] = this.target(path); if (!o) return 0;
    const v = (o as any)[prop][axis] as number; return prop === 'rotation' ? v / D2R : v;
  }
  private write(path: string, value: number) {
    const [o, prop, axis] = this.target(path); if (!o) return;
    (o as any)[prop][axis] = prop === 'rotation' ? value * D2R : value;
  }
}
```
Note: `root.position.z` is local forward — wrap the unit in a parent `pivot` object facing the victim so +Z is always "toward the target".

### 13.4 Secondary motion chain (cape, trunk, tail, ears, mane)
```ts
// src/units/SecondaryChain.ts — spring-damper per bone, lags behind body motion
import * as THREE from 'three';

export class SecondaryChain {
  private vel: THREE.Vector2[]; private off: THREE.Vector2[];
  private prevWorld = new THREE.Vector3(); private tmp = new THREE.Vector3();
  constructor(private bones: THREE.Bone[], private p: {
    stiffness: number; damping: number; inertia: number; // e.g. cape 40/6/1.2, trunk 25/5/0.8, tail 30/4/1.0
    wind?: number; idleAmp?: number; idleFreq?: number; phasePerBone?: number;
  }) {
    this.vel = bones.map(() => new THREE.Vector2()); this.off = bones.map(() => new THREE.Vector2());
    bones[0].getWorldPosition(this.prevWorld);
  }
  update(dt: number, time: number) {
    if (dt <= 0) return;
    this.bones[0].getWorldPosition(this.tmp);
    const vx = (this.tmp.x - this.prevWorld.x) / dt, vz = (this.tmp.z - this.prevWorld.z) / dt;
    this.prevWorld.copy(this.tmp);
    const speed = Math.hypot(vx, vz);
    this.bones.forEach((b, i) => {
      const w = (i + 1) / this.bones.length;                           // tip moves more
      const ph = time * (this.p.idleFreq ?? 1) - i * (this.p.phasePerBone ?? 0.4);
      const targetX = -speed * this.p.inertia * 0.05 * w + Math.sin(ph) * (this.p.idleAmp ?? 0.05) * w
                      + (this.p.wind ?? 0) * 0.03 * Math.sin(time * 2.3 + i) * w;
      const targetZ = Math.sin(ph * 0.7) * (this.p.idleAmp ?? 0.05) * 0.5 * w;
      const a = this.off[i], v = this.vel[i];
      v.x += ((targetX - a.x) * this.p.stiffness - v.x * this.p.damping) * dt;
      v.y += ((targetZ - a.y) * this.p.stiffness - v.y * this.p.damping) * dt;
      a.x += v.x * dt; a.y += v.y * dt;
      b.rotation.x += a.x; b.rotation.z += a.y;   // additive on top of the clip pose
    });
  }
}
```
Presets: **cape** (king/queen) stiffness 40, damping 6, inertia 1.2, wind 1 · **trunk** 25/5/0.8, idleAmp 0.15, phasePerBone 0.5 · **tail** (horse) 30/4/1.0, idleAmp 0.2 · **ears** (elephant) driven by keyframe flap timer instead · **mane** 50/7/1.0 · **howdah** single-bone 20/3/0.6 (roll only).

### 13.5 Ballistic arcs (knight leap, thrown victims, rider falls, chakram return)
```ts
// position at t ∈ [0,1]
export function arc(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, height: number, t: number) {
  out.lerpVectors(a, b, t); out.y += 4 * height * t * (1 - t); return out;
}
// quadratic bezier for chakram return, control point offset sideways by 2 m
export function bezier(out: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number) {
  const u = 1 - t;
  return out.set(u*u*a.x + 2*u*t*c.x + t*t*b.x, u*u*a.y + 2*u*t*c.y + t*t*b.y, u*u*a.z + 2*u*t*c.z + t*t*b.z);
}
```

### 13.6 Afterimages (queen sprint)
Every 2 frames: `SkeletonUtils.clone(queen.root)`, copy each bone's current quaternion, set all materials to a shared `MeshBasicMaterial({ color: factionTint, transparent: true, opacity: 0.5, depthWrite: false, blending: AdditiveBlending })`, fade opacity to 0 over 10 f, return to a pool of 4. No mixer on the clone (frozen pose).

### 13.7 Frame order inside the render loop (critical)
```
1. scaledDt = clock.tick(realDt)
2. mixer.update(scaledDt)                 // clips set base pose
3. keyframePlayers.update(scaledDt)       // fallbacks / one-shots
4. secondaryChains.update(scaledDt, t)    // additive lag motion
5. lookAt / IK adjustments                // last, so they win
6. particles.update(scaledDt); camera.update(realDt); render
```

---

