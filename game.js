// ─────────────────────────────────────────────
//  Football Dribble Climber — game.js
//  Phaser 3.90.0 · Zero external assets
//  Player uses NO physics body — pure tweens + manual collision
// ─────────────────────────────────────────────

const GAME_W = 400;
const GAME_H = 700;

const WALL_W = 18;
const LEFT_X = WALL_W + 30;
const RIGHT_X = GAME_W - WALL_W - 30;

const START_SPEED   = 200;
const SPEED_INC     = 4.5;
const MAX_SPEED     = 650;

const OBS_W_MIN     = 90;
const OBS_W_MAX     = 145;
const OBS_H         = 22;
const GAP_START     = 260;
const GAP_MIN       = 125;

const FLIP_MS       = 130;

// ── Palette — Stadium Night ──────────────────
const C = {
  bg:        0x1a472a,   // Dark stadium grass
  bgLight:   0x22633b,   // Lighter grass stripe
  wall:      0xffffff,   // White touchline
  wallEdge:  0x4ade80,   // Subtle green inner edge
  player:    0xffffff,   // Football base white
  glow:      0x4ade80,   // Green underglow
  obsL:      0xf97316,   // Orange cone
  obsR:      0xf97316,   // Orange cone
  accent:    0xef4444,   // Red card
  gold:      0xfbbf24,   // Trophy gold
  tMain:     '#ffffff',
  tSub:      '#86efac',  // Light mint green
  tGold:     '#fde047',
  tAccent:   '#ef4444',
  tDim:      '#4ade80',
  coneTip:   0xffffff,   // White cone tip
};

// ── User Persistence (localStorage) ──────────
let currentUser = localStorage.getItem('footballDribbleUser') || null;
let userData = { highScore: 0, timesPlayed: 0 };

async function fetchUser(username) {
  const dataStr = localStorage.getItem('fbuser_' + username);
  if (dataStr) {
    try { return JSON.parse(dataStr); } catch(e) {}
  }
  return { username, highScore: 0, timesPlayed: 0 };
}

async function saveUser(username, highScore, playedInc) {
  try {
    const existingStr = localStorage.getItem('fbuser_' + username);
    let existing = { username, highScore: 0, timesPlayed: 0 };
    if (existingStr) existing = JSON.parse(existingStr);
    existing.highScore = Math.max(existing.highScore, highScore);
    existing.timesPlayed += playedInc;
    localStorage.setItem('fbuser_' + username, JSON.stringify(existing));
  } catch (e) {}
}

let isMuted = localStorage.getItem('fb_muted') === 'true';
function toggleMute(scene, btn) {
  isMuted = !isMuted;
  localStorage.setItem('fb_muted', isMuted);
  scene.sound.mute = isMuted;
  if (btn) btn.setAlpha(isMuted ? 0.3 : 1);
}
function createMuteBtn(scene) {
  scene.sound.mute = isMuted;
  const btn = scene.add.image(GAME_W - 20, 20, 'soundIcon')
    .setOrigin(1, 0)
    .setTintFill(0xffffff)
    .setDisplaySize(28, 28)
    .setAlpha(isMuted ? 0.3 : 1)
    .setInteractive({ useHandCursor: true })
    .setDepth(100);
  
  btn.on('pointerdown', (p, x, y, e) => {
    e.stopPropagation();
    toggleMute(scene, btn);
  });
  return btn;
}


// ── Texture Generators ───────────────────────

function makeCircleTex(scene, key, radius, color, alpha) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(color, alpha != null ? alpha : 1);
  g.fillCircle(radius, radius, radius);
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
}

// Classic black & white football with pentagons
function makeFootballTex(scene, key, radius, alpha) {
  if (scene.textures.exists(key)) return;
  const d = radius * 2;
  const g = scene.make.graphics({ add: false });
  const a = alpha != null ? alpha : 1;

  // White ball base
  g.fillStyle(0xffffff, a);
  g.fillCircle(radius, radius, radius);

  // Subtle dark outline
  g.lineStyle(1.5, 0x333333, a * 0.6);
  g.strokeCircle(radius, radius, radius - 1);

  // Black pentagon patches
  g.fillStyle(0x1a1a2e, a);
  const ps = radius * 0.32;
  g.fillCircle(radius, radius, ps);

  // Five satellite pentagons
  const sat = radius * 0.22;
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const sx = radius + Math.cos(angle) * radius * 0.65;
    const sy = radius + Math.sin(angle) * radius * 0.65;
    g.fillCircle(sx, sy, sat);
  }

  // White seam lines
  g.lineStyle(1, 0xffffff, a * 0.8);
  for (let i = 0; i < 5; i++) {
    const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const ex = radius + Math.cos(angle) * radius * 0.44;
    const ey = radius + Math.sin(angle) * radius * 0.44;
    g.lineBetween(radius + Math.cos(angle) * ps, radius + Math.sin(angle) * ps, ex, ey);
  }

  // Highlight (top-left light reflection)
  g.fillStyle(0xffffff, a * 0.45);
  g.fillCircle(radius * 0.7, radius * 0.65, radius * 0.2);

  g.generateTexture(key, d, d);
  g.destroy();
}

// Draw repeating grass stripes into the background
function drawGrassStripes(scene, startY, height) {
  const g = scene.add.graphics().setDepth(0);
  const stripeH = 50;
  const sy = Math.floor(startY / stripeH) * stripeH;
  for (let y = sy; y < startY + height; y += stripeH) {
    if (Math.floor(y / stripeH) % 2 === 0) {
      g.fillStyle(C.bgLight, 0.25);
      g.fillRect(WALL_W, y, GAME_W - WALL_W * 2, stripeH);
    }
  }
  return g;
}


// ── Sound & Vibration ─────────────────────
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playSound(type, startFreq, endFreq, duration, vol) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), audioCtx.currentTime + duration);
  
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

// 💥 Foul crunch — body collision + whistle after delay
function playFoul() {
  if (isMuted || !audioCtx) return;
  const now = audioCtx.currentTime;

  // Impact thud
  const thud = audioCtx.createOscillator();
  const thudG = audioCtx.createGain();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(60, now);
  thud.frequency.exponentialRampToValueAtTime(20, now + 0.25);
  thudG.gain.setValueAtTime(0.2, now);
  thudG.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
  thud.connect(thudG); thudG.connect(audioCtx.destination);
  thud.start(now); thud.stop(now + 0.26);

  // Harsh crunch noise
  const crunchBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.15, audioCtx.sampleRate);
  const cData = crunchBuf.getChannelData(0);
  for (let i = 0; i < cData.length; i++) cData[i] = (Math.random() * 2 - 1) * (1 - i / cData.length);
  const crunch = audioCtx.createBufferSource();
  crunch.buffer = crunchBuf;
  const cG = audioCtx.createGain();
  cG.gain.setValueAtTime(0.12, now);
  cG.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  crunch.connect(cG); cG.connect(audioCtx.destination);
  crunch.start(now); crunch.stop(now + 0.16);

}

// 🎺 Stadium horn (for 500+ milestones — ascending fanfare)
function playStadiumHorn() {
  if (isMuted || !audioCtx) return;
  const now = audioCtx.currentTime;
  const notes = [220, 277, 330, 440];
  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    // Slight detune for brass warmth
    osc.detune.value = Phaser.Math.Between(-10, 10);
    gain.gain.setValueAtTime(0.001, now + i * 0.18);
    gain.gain.linearRampToValueAtTime(0.05, now + i * 0.18 + 0.04);
    gain.gain.setValueAtTime(0.05, now + i * 0.18 + 0.2);
    gain.gain.linearRampToValueAtTime(0.001, now + i * 0.18 + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.45);
  });
}

function vibe(pattern) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch(e) {}
  }
}


// ═══════════════════════════════════════════════
//  BootScene
// ═══════════════════════════════════════════════
class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    this.load.image('ball', 'ball.png');
    this.load.image('soundIcon', 'sound-icon.png');
    this.load.audio('kickSound', 'soccer-ball-quick-kick.wav');
    this.load.audio('cheerSound', 'ending-show-audience-clapping.wav');
    this.load.audio('whistleSound', 'whistle-615.wav');
  }

  create() {
    const cx = GAME_W / 2, cy = GAME_H / 2;
    this.cameras.main.setBackgroundColor(C.bg);

    if (!currentUser) {
      const modal = document.getElementById('user-modal');
      const input = document.getElementById('username-input');
      const btn = document.getElementById('start-btn');
      
      modal.classList.remove('hidden');
      input.focus();
      
      btn.onclick = () => {
        const name = input.value.trim();
        if (name) {
          currentUser = name;
          localStorage.setItem('footballDribbleUser', name);
          modal.classList.add('hidden');
          this.scene.restart();
        }
      };
      return;
    }

    const loadingTxt = this.add.text(cx, cy, '⚽', {
      fontSize: '40px', align: 'center'
    }).setOrigin(0.5);
    this.tweens.add({ targets: loadingTxt, angle: 360, duration: 800, repeat: -1, ease: 'Linear' });

    fetchUser(currentUser).then(data => {
      userData = data;
      loadingTxt.destroy();
      this.buildStartScreen(cx, cy);
    });
  }

  buildStartScreen(cx, cy) {
    // Glow texture (ball.png is preloaded)
    makeCircleTex(this, 'ballGlow', 26, C.glow, 0.2);

    // ── Background: grass stripes ──
    drawGrassStripes(this, 0, GAME_H);

    // Pitch marking: center circle
    const pg = this.add.graphics().setDepth(1);
    pg.lineStyle(2, 0xffffff, 0.15);
    pg.strokeCircle(cx, cy + 40, 80);
    pg.fillStyle(0xffffff, 0.08);
    pg.fillCircle(cx, cy + 40, 4);

    // ── Title ──
    this.add.text(cx, cy - 160, 'FOOTBALL', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '46px', fontStyle: 'bold', color: '#ffffff', align: 'center',
    }).setOrigin(0.5);
    
    this.add.text(cx, cy - 108, 'DRIBBLE', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '22px', letterSpacing: 14, color: '#fb923c', align: 'center',
    }).setOrigin(0.5);

    // Decorative line under title
    const titleLine = this.add.graphics().setDepth(2);
    titleLine.fillStyle(0xfb923c, 0.6);
    titleLine.fillRect(cx - 60, cy - 82, 120, 2);

    // Ghost markers (faded ball)
    const ghostL = this.add.image(LEFT_X, cy + 40, 'ball').setAlpha(0.15).setScale(0.14);
    const ghostR = this.add.image(RIGHT_X, cy + 40, 'ball').setAlpha(0.15).setScale(0.14);

    // Animated demo ball
    const demoGlow = this.add.image(LEFT_X, cy + 40, 'ballGlow');
    const demoBall = this.add.image(LEFT_X, cy + 40, 'ball').setScale(0.06);

    this.tweens.add({
      targets: [demoBall, demoGlow],
      x: { from: LEFT_X, to: RIGHT_X },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    // Spin the ball as it moves
    this.tweens.add({
      targets: demoBall,
      angle: { from: 0, to: 360 },
      duration: 1800, repeat: -1, ease: 'Linear',
    });

    // Best score (trophy style)
    if (userData.highScore > 0) {
      this.add.text(cx, cy + 110, `🏆  ${userData.highScore}`, {
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        fontSize: '22px', fontStyle: 'bold', color: C.tGold,
      }).setOrigin(0.5);
    }
    
    // Mute button
    createMuteBtn(this);
    
    // Player Name badge
    const badge = this.add.graphics().setDepth(2);
    badge.fillStyle(0x000000, 0.25);
    badge.fillRoundedRect(cx - 70, cy + 142, 140, 26, 13);
    this.add.text(cx, cy + 155, `⚽  ${currentUser.toUpperCase()}`, {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '11px', letterSpacing: 1, color: '#bbf7d0',
    }).setOrigin(0.5);

    // Tap to start
    const tap = this.add.text(cx, cy + 210, 'TAP TO START', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '14px', letterSpacing: 4, color: C.tSub,
    }).setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: { from: 1, to: 0.15 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Change Player button
    const changeBtn = this.add.text(cx, GAME_H - 30, 'CHANGE PLAYER', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '10px', letterSpacing: 2, color: '#4ade80',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setAlpha(0.5);
    
    changeBtn.on('pointerover', () => changeBtn.setAlpha(1));
    changeBtn.on('pointerout', () => changeBtn.setAlpha(0.5));
    changeBtn.on('pointerdown', (p, x, y, e) => {
      e.stopPropagation();
      currentUser = null;
      localStorage.removeItem('footballDribbleUser');
      this.scene.restart();
    });

    this.input.once('pointerdown', () => {
      initAudio();
      this.sound.play('whistleSound');
      vibe(15);
      this.cameras.main.fadeOut(200, 26, 71, 42);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
    });
  }
}


// ═══════════════════════════════════════════════
//  GameScene
// ═══════════════════════════════════════════════
class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    this.load.image('ball', 'ball.png');
  }

  create() {
    this.side = 'left';
    this.speed = START_SPEED;
    this.originY = GAME_H - 100;
    this.alive = true;
    this.elapsed = 0;
    this.lastObsY = this.originY;
    this.nextObsSide = 'right';
    this.score = 0;
    this.obsList = [];

    this.cameras.main.setBackgroundColor(C.bg);
    this.cameras.main.fadeIn(200, 26, 71, 42);
    
    // Mute button
    this.muteBtn = createMuteBtn(this);
    this.muteBtn.setScrollFactor(0);

    // Textures (ball.png is preloaded)
    makeCircleTex(this, 'ballGlow', 26, C.glow, 0.2);
    makeCircleTex(this, 'trail', 8, C.player, 0.3);

    // ── Walls (touchlines) ──
    this.wallL = this.add.rectangle(WALL_W / 2, 0, WALL_W, GAME_H * 4, C.wall).setDepth(0);
    this.wallR = this.add.rectangle(GAME_W - WALL_W / 2, 0, WALL_W, GAME_H * 4, C.wall).setDepth(0);
    this.edgeL = this.add.rectangle(WALL_W + 1, 0, 3, GAME_H * 4, C.wallEdge, 0.2).setDepth(1);
    this.edgeR = this.add.rectangle(GAME_W - WALL_W - 1, 0, 3, GAME_H * 4, C.wallEdge, 0.2).setDepth(1);

    // ── Grass stripe layer ──
    this.grassLayer = this.add.graphics().setDepth(0);
    this.lastGrassY = this.originY + GAME_H;

    // ── Player ──
    this.glow = this.add.image(LEFT_X, this.originY, 'ballGlow').setDepth(9);
    
    // Wrap the ball in a container so we can squash the container and forward-roll the inner image
    this.player = this.add.container(LEFT_X, this.originY).setDepth(10);
    this.ballImage = this.add.image(0, 0, 'ball').setScale(0.06);
    this.player.add(this.ballImage);

    // Glow pulse
    this.tweens.add({
      targets: this.glow,
      scale: { from: 1, to: 1.4 }, alpha: { from: 0.2, to: 0.04 },
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ── Pre-spawn obstacles ──
    this.spawnBatch();

    // ── Score HUD ──
    this.scoreTxt = this.add.text(GAME_W / 2, 30, '0', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '32px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0.5);

    // ── Input ──
    this.input.on('pointerdown', () => {
      if (!this.alive) return;
      initAudio();
      this.sound.play('kickSound');
      vibe(15);
      this.flip();
    });

    // Crowd milestone tracking
    this.lastMilestone = 0;
  }

  flip() {
    this.side = this.side === 'left' ? 'right' : 'left';
    const targetX = this.side === 'left' ? LEFT_X : RIGHT_X;

    // Trail
    const t = this.add.image(this.player.x, this.player.y, 'trail').setDepth(8);
    this.tweens.add({ targets: t, alpha: 0, scale: 0.2, duration: 200, onComplete: () => t.destroy() });

    this.tweens.add({
      targets: [this.player, this.glow],
      x: targetX,
      duration: FLIP_MS,
      ease: 'Cubic.easeInOut',
    });

    // Spin the ball when it moves side to side
    this.tweens.add({
      targets: this.ballImage,
      angle: this.ballImage.angle + (this.side === 'right' ? 360 : -360),
      duration: FLIP_MS + 80,
      ease: 'Sine.easeOut',
    });
    
    // Squash & stretch (relative to 1.0 container base scale)
    const bs = 1.0;
    this.player.setScale(bs);
    this.tweens.add({
      targets: this.player,
      scaleX: { value: bs * 1.35, duration: FLIP_MS * 0.4, yoyo: true, ease: 'Sine.easeOut' },
      scaleY: { value: bs * 0.65, duration: FLIP_MS * 0.4, yoyo: true, ease: 'Sine.easeOut' },
    });
    
    // Wall impact bounce
    this.tweens.add({
      targets: this.player,
      scaleX: { from: bs * 0.75, to: bs },
      scaleY: { from: bs * 1.25, to: bs },
      duration: 150,
      delay: FLIP_MS - 20,
      ease: 'Bounce.easeOut'
    });
  }

  spawnBatch() {
    let y = this.originY - GAP_START;
    for (let i = 0; i < 10; i++) {
      this.spawnObs(y);
      y -= this.currentGap();
    }
    this.lastObsY = y;
  }

  spawnObs(y) {
    const side = this.nextObsSide;
    this.nextObsSide = side === 'left' ? 'right' : 'left';

    const w = Phaser.Math.Between(OBS_W_MIN, OBS_W_MAX);
    const x = side === 'left' ? WALL_W + w / 2 : GAME_W - WALL_W - w / 2;

    // Main obstacle bar (orange cone color)
    const rect = this.add.rectangle(x, y, w, OBS_H, 0xf97316, 0.9).setDepth(5);

    // White reflective stripe
    const stripeW = w * 0.5;
    const stripe = this.add.rectangle(x, y, stripeW, 4, 0xffffff, 0.7).setDepth(6);

    // Pointed cone tip on the open side
    const tipSize = 10;
    const tipX = side === 'left' ? x + w / 2 + tipSize / 2 + 2 : x - w / 2 - tipSize / 2 - 2;
    const tip = this.add.triangle(
      tipX, y, 
      0, -tipSize/2, 
      0, tipSize/2, 
      side === 'left' ? tipSize : -tipSize, 0, 
      0xf97316, 0.5
    ).setDepth(5);

    this.obsList.push({ rect, stripe, tip, x, y, w, h: OBS_H, side });
  }

  currentGap() {
    const t = Phaser.Math.Clamp((this.speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1);
    return Phaser.Math.Linear(GAP_START, GAP_MIN, t);
  }

  checkCollisions() {
    const px = this.player.x;
    const py = this.player.y;
    const pr = 11;

    for (let i = 0; i < this.obsList.length; i++) {
      const o = this.obsList[i];
      const left   = o.x - o.w / 2;
      const right  = o.x + o.w / 2;
      const top    = o.y - o.h / 2;
      const bottom = o.y + o.h / 2;

      const cx = Math.max(left, Math.min(px, right));
      const cy = Math.max(top, Math.min(py, bottom));
      const dx = px - cx;
      const dy = py - cy;

      if (dx * dx + dy * dy < pr * pr) {
        this.die();
        return;
      }
    }
  }

  die() {
    this.alive = false;
    
    playFoul();
    this.time.delayedCall(300, () => this.sound.play('whistleSound'));
    vibe([50, 30, 80, 30, 120]); // Aggressive foul vibration pattern
    
    this.cameras.main.flash(250, 239, 68, 68); // Red flash
    this.cameras.main.shake(200, 0.012);
    this.tweens.killTweensOf(this.glow);
    this.glow.setAlpha(0);

    this.time.delayedCall(500, () => {
      this.scene.start('GameOverScene', { score: this.score });
    });
  }

  update(_t, delta) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this.elapsed += dt;

    this.speed = Math.min(START_SPEED + SPEED_INC * this.elapsed, MAX_SPEED);

    // ── Move player upward ──
    this.player.y -= this.speed * dt;
    this.glow.y = this.player.y;

    this.score = Math.max(0, Math.floor((this.originY - this.player.y) / 10));
    this.scoreTxt.setText(this.score);

    // ⚽ Crowd cheer every 200 points!
    const currentMilestone = Math.floor(this.score / 200) * 200;
    if (currentMilestone > 0 && currentMilestone > this.lastMilestone) {
      this.lastMilestone = currentMilestone;
      
      // Play the loaded clapping sound
      const cheer = this.sound.add('cheerSound');
      cheer.play();
      // Stop the sound after exactly 2 seconds
      this.time.delayedCall(2000, () => cheer.stop());
      
      if (currentMilestone % 1000 === 0) { // Scaled stadium horn up to 1000 to keep it rare
        // Big milestone — stadium horn + strong vibration
        playStadiumHorn();
        vibe([100, 50, 100, 50, 200]);
      } else {
        // Regular 200 milestone celebration vibration
        vibe([60, 40, 60]);
      }
      
      // Flash score text gold briefly
      this.scoreTxt.setColor(C.tGold);
      this.tweens.add({
        targets: this.scoreTxt,
        scale: { from: 1.4, to: 1 },
        duration: 400,
        ease: 'Bounce.easeOut',
        onComplete: () => this.scoreTxt.setColor('#ffffff'),
      });
    }

    this.cameras.main.scrollY = this.player.y - (GAME_H - 100);

    this.checkCollisions();

    const wy = this.cameras.main.scrollY + GAME_H / 2;
    [this.wallL, this.wallR, this.edgeL, this.edgeR].forEach(w => {
      w.setY(wy);
      w.height = GAME_H * 3;
    });

    // Draw grass stripes ahead
    const horizon = this.player.y - GAME_H;
    while (this.lastGrassY > horizon) {
      this.lastGrassY -= 50;
      if (Math.floor(this.lastGrassY / 50) % 2 === 0) {
        this.grassLayer.fillStyle(C.bgLight, 0.2);
        this.grassLayer.fillRect(WALL_W, this.lastGrassY, GAME_W - WALL_W * 2, 50);
      }
    }

    // Spawn obstacles ahead
    while (this.lastObsY > horizon) {
      this.lastObsY -= this.currentGap();
      this.spawnObs(this.lastObsY);
    }

    // Recycle off-screen obstacles
    const kill = this.player.y + GAME_H;
    for (let i = this.obsList.length - 1; i >= 0; i--) {
      if (this.obsList[i].y > kill) {
        this.obsList[i].rect.destroy();
        this.obsList[i].stripe.destroy();
        this.obsList[i].tip.destroy();
        this.obsList.splice(i, 1);
      }
    }
  }
}


// ═══════════════════════════════════════════════
//  GameOverScene
// ═══════════════════════════════════════════════
class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOverScene'); }

  create(data) {
    const cx = GAME_W / 2, cy = GAME_H / 2;
    const score = data.score || 0;
    this.cameras.main.setBackgroundColor(C.bg);

    const prev = userData.highScore || 0;
    const isNew = score > prev;
    const best = Math.max(score, prev);
    
    userData.highScore = best;
    saveUser(currentUser, score, 1);

    // ── Background ──
    drawGrassStripes(this, 0, GAME_H);

    // Darken overlay
    this.add.rectangle(cx, cy, GAME_W, GAME_H, 0x000000, 0.35).setDepth(1);

    // ── Red Card ──
    const banner = this.add.graphics().setDepth(2);
    banner.fillStyle(0xef4444, 0.9);
    banner.fillRoundedRect(cx - 30, cy - 180, 60, 80, 6);
    banner.lineStyle(2, 0xffffff, 0.5);
    banner.strokeRoundedRect(cx - 30, cy - 180, 60, 80, 6);

    // FOUL text
    this.add.text(cx, cy - 80, 'FOUL!', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '42px', fontStyle: 'bold', color: '#ef4444',
    }).setOrigin(0.5).setDepth(3);

    // ── Score Panel ──
    const panel = this.add.graphics().setDepth(2);
    panel.fillStyle(0x000000, 0.3);
    panel.fillRoundedRect(cx - 100, cy - 30, 200, 140, 12);

    this.add.text(cx, cy - 10, 'DISTANCE', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '12px', letterSpacing: 6, color: C.tSub,
    }).setOrigin(0.5).setDepth(3);

    const sTxt = this.add.text(cx, cy + 36, '0', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '56px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(3);

    this.tweens.add({
      targets: { v: 0 }, v: score,
      duration: Math.min(score * 8, 700), ease: 'Power2',
      onUpdate: (_tw, target) => sTxt.setText(Math.floor(target.v)),
    });

    // Divider
    this.add.rectangle(cx, cy + 75, 80, 1, 0xffffff, 0.2).setDepth(3);

    // Best score
    if (isNew) {
      const b = this.add.text(cx, cy + 95, '🏆  NEW RECORD!', {
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        fontSize: '16px', fontStyle: 'bold', color: C.tGold,
      }).setOrigin(0.5).setDepth(3);
      this.tweens.add({ targets: b, scale: { from: 1, to: 1.06 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      this.add.text(cx, cy + 95, `BEST  ${best}`, {
        fontFamily: '"Helvetica Neue", Arial, sans-serif',
        fontSize: '15px', color: C.tSub,
      }).setOrigin(0.5).setDepth(3);
    }

    createMuteBtn(this);

    // Retry
    const r = this.add.text(cx, cy + 180, 'TAP TO RETRY', {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: '14px', letterSpacing: 4, color: C.tSub,
    }).setOrigin(0.5).setDepth(3);
    this.tweens.add({ targets: r, alpha: { from: 0.8, to: 0.15 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.time.delayedCall(500, () => {
      this.input.once('pointerdown', () => {
        this.sound.play('whistleSound');
        vibe(15);
        this.cameras.main.fadeOut(250, 26, 71, 42);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('GameScene'));
      });
    });
  }
}


// ═══════════════════════════════════════════════
//  Config
// ═══════════════════════════════════════════════
new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  parent: document.body,
  backgroundColor: '#1a472a',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, GameScene, GameOverScene],
});
