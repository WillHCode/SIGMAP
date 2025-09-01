struct Particle {
    spawn: vec2f,
    life: f32,
    angle: f32,
    posHistory: array<vec2f, 50>, // TRAIL_LENGTH
};

struct Params {
    deltaTime: f32,
    simSpeed: f32,
};

struct Camera {
  invScale: f32,
  offsetU: f32,
  offsetV: f32,
  _pad: f32,
};

@group(0) @binding(0) var<storage, read> inputParticles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> outputParticles: array<Particle>;
@group(0) @binding(2) var windTexture: texture_2d<f32>;
@group(0) @binding(3) var<uniform> params: Params;
@group(0) @binding(4) var<uniform> camera: Camera;
@group(0) @binding(5) var<uniform> gridInfo: vec2<f32>;

const MAX_LIFETIME: f32 = 10.0;
const TRAIL_LENGTH: u32 = 50u;

fn uhash(x0: u32) -> u32 {
    var x = x0;
    x = ((x >> 16u) ^ x) * 0x45d9f3bu;
    x = ((x >> 16u) ^ x) * 0x45d9f3bu;
    x = (x >> 16u) ^ x;
    return x;
}

fn random_for_index(idx: u32) -> f32 {
    // map 0..2^32-1 -> 0..1
    let h = uhash(idx);
    return f32(h) / 4294967295.0;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    let i = global_id.x;

    // safety guard NUM_PARTICLES
    if (i >= 100000u) { return; }

    var p = inputParticles[i];
    var pos = p.posHistory[0]; // normalized 0..1 "world" position

    let sampleU = pos.x * camera.invScale + camera.offsetU;
    let sampleV = pos.y * camera.invScale + camera.offsetV;

    let su = sampleU - floor(sampleU);
    let sv = clamp(sampleV, 0.0, 1.0);

    let texX = u32(su * (gridInfo.x - 1.0));
    let texY = u32(sv * (gridInfo.y - 1.0));

    let wind = textureLoad(windTexture, vec2u(texX, texY), 0).xy;

    pos = pos + wind * params.deltaTime * params.simSpeed;

    // Shift position history
    for (var j = TRAIL_LENGTH - 1u; j > 0u; j = j - 1u) {
        p.posHistory[j] = p.posHistory[j - 1u];
    }
    p.posHistory[0] = pos;

    var newLife = p.life - params.deltaTime;
    let newAngle = atan2(wind.y, wind.x);

    if (newLife <= 0.0) {
        pos = p.spawn;
        newLife = random_for_index(u32(i)) * MAX_LIFETIME;

        for (var j: u32 = 0u; j < TRAIL_LENGTH; j = j + 1u) {
            p.posHistory[j] = pos;
        }
    }

    outputParticles[i] = Particle(
        p.spawn,
        newLife,
        newAngle,
        p.posHistory
    );
}
