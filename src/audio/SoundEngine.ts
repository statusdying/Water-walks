// Procedural Web Audio API sound synthesizer — zero external audio file dependencies

class SoundEngine {
  private ctx: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private isMuted: boolean = false;
  private ambientStarted: boolean = false;
  private birdInterval: number | null = null;

  public init() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    if (!this.ambientStarted) {
      this.startAmbientForest();
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.ambientGain && this.ctx) {
      this.ambientGain.gain.setTargetAtTime(muted ? 0 : 0.14, this.ctx.currentTime, 0.15);
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  private startAmbientForest() {
    if (!this.ctx || this.ambientStarted) return;
    this.ambientStarted = true;

    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      output[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = output[i];
      output[i] *= 1.8;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 1.4;

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.16;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(filter.frequency);
    lfo.start();

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = this.isMuted ? 0 : 0.14;

    whiteNoise.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.ctx.destination);
    whiteNoise.start();

    this.birdInterval = window.setInterval(() => {
      if (
        this.isMuted ||
        !this.ctx ||
        !this.ambientGain ||
        this.ambientGain.gain.value < 0.02
      )
        return;
      if (Math.random() < 0.45) {
        this.playBirdChirp();
      }
    }, 4500);
  }

  private playBirdChirp() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 1650 + Math.random() * 600;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.28, now + 0.09);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.92, now + 0.22);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.025, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public muteAmbientImmediately() {
    if (!this.ctx || !this.ambientGain) return;
    this.ambientGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.ambientGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
  }

  public restoreAmbient() {
    if (!this.ctx || !this.ambientGain || this.isMuted) return;
    this.ambientGain.gain.setTargetAtTime(0.14, this.ctx.currentTime, 0.5);
  }

  public playFootstep(inWater: boolean, loadRatio: number, fractureRatio: number) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    if (inWater) {
      this.playNoiseBurst(0.12, 950, 1.2, 0.09);
    } else {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const pitch = 135 - loadRatio * 42 + (Math.random() - 0.5) * 20;
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.065);

      gain.gain.setValueAtTime(0.14 + loadRatio * 0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    }

    if (fractureRatio >= 0.3) {
      const intensity = Math.min(1, (fractureRatio - 0.3) / 0.68);
      if (Math.random() < 0.45 + intensity * 0.5) {
        this.playHandleStressCreak(intensity);
      }
    }
  }

  public playHandleStressCreak(intensity: number) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    const baseFreq = 240 + intensity * 290 + (Math.random() - 0.5) * 60;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(
      baseFreq * (0.72 + Math.random() * 0.2),
      now + 0.14
    );

    mod.type = 'square';
    mod.frequency.value = 34 + intensity * 25;
    modGain.gain.value = 45 * intensity;
    mod.connect(modGain);
    modGain.connect(osc.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 720 + intensity * 600;
    filter.Q.value = 4.5;

    const vol = 0.03 + intensity * 0.12;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    mod.start(now);
    osc.start(now);
    mod.stop(now + 0.17);
    osc.stop(now + 0.17);
  }

  public playWaterDipTick(fillRatio: number) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';

    const startFreq = 260 + fillRatio * 420 + (Math.random() - 0.5) * 35;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 1.45, now + 0.085);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playWaterPourTick() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    this.playNoiseBurst(0.11, 680 + Math.random() * 380, 1.8, 0.09);
  }

  public playCoinChime(isUpgrade = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const notes = isUpgrade ? [587.33, 783.99, 1046.5] : [880, 1174.66];

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.29);
    });
  }

  /**
   * LEFT-HAND ACTION 1: Cigarette inhale sizzle + exhale puff sound.
   */
  public playCigarettePuff() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    this.playNoiseBurst(0.55, 3200, 2.2, 0.08);
    for (let i = 0; i < 6; i++) {
      const popTime = now + i * 0.08 + Math.random() * 0.04;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1400 + Math.random() * 1200, popTime);
      gain.gain.setValueAtTime(0.04, popTime);
      gain.gain.exponentialRampToValueAtTime(0.0005, popTime + 0.025);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(popTime);
      osc.stop(popTime + 0.03);
    }

    window.setTimeout(() => {
      if (!this.ctx || this.isMuted) return;
      this.playNoiseBurst(0.65, 520, 0.9, 0.12);
    }, 650);
  }

  /**
   * LEFT-HAND ACTION 2: Butterfly Knife (Balisong) metallic flip & clack combo.
   */
  public playKnifeTrick() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const clickTimes = [0, 0.14, 0.29, 0.46];
    const clickFreqs = [2200, 2650, 1950, 3100];

    clickTimes.forEach((offset, idx) => {
      if (!this.ctx) return;
      const t = now + offset;

      this.playNoiseBurstAt(t, 0.07, 1400, 1.5, 0.07);

      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc2.type = 'sine';
      const f = clickFreqs[idx];
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.06);
      osc2.frequency.setValueAtTime(f * 1.62, t);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + (idx === 3 ? 0.22 : 0.08));

      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc2.start(t);
      osc.stop(t + (idx === 3 ? 0.24 : 0.09));
      osc2.stop(t + (idx === 3 ? 0.24 : 0.09));
    });
  }

  /**
   * LEFT-HAND ACTION 3: Fidget Spinner flick & high-speed ball-bearing whir.
   */
  public playSpinnerFlick() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    this.playNoiseBurst(0.05, 1800, 2.0, 0.12);

    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc2.type = 'triangle';

    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(240, now + 1.1);

    osc2.frequency.setValueAtTime(680, now);
    osc2.frequency.exponentialRampToValueAtTime(1360, now + 0.12);
    osc2.frequency.exponentialRampToValueAtTime(480, now + 1.1);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.15);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 1.2);
    osc.stop(now + 1.2);
  }

  /**
   * LEFT-HAND ACTION 4: Drinking Beer (3 hearty gulps + refreshing foam fizz + satisfied sigh).
   */
  public playBeerDrink() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Foam fizz
    this.playNoiseBurst(0.25, 2200, 1.5, 0.06);

    // 3 hearty "glug-glug-glug" gulps
    [0.18, 0.52, 0.86].forEach((offset, idx) => {
      if (!this.ctx) return;
      const t = now + offset;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const baseF = 180 + idx * 22;
      osc.frequency.setValueAtTime(baseF, t);
      osc.frequency.exponentialRampToValueAtTime(baseF * 1.85, t + 0.11);
      osc.frequency.exponentialRampToValueAtTime(baseF * 0.9, t + 0.19);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.21);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });

    // Satisfied "Ahhh" breath at the end (+1.2s)
    this.playNoiseBurstAt(now + 1.2, 0.45, 750, 1.4, 0.1);
  }

  /**
   * LEFT-HAND ACTION 5: Marksman Rifle Gunshot + Bolt Cycle!
   */
  public playRifleShot() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // 1. Sharp gunpowder muzzle blast transient
    this.playNoiseBurst(0.18, 1200, 0.55, 0.75);
    this.playNoiseBurst(0.35, 420, 0.8, 0.55);

    // 2. Low-end gunshot punch
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.24);
    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);

    // 3. Mechanical bolt-action reload clack at +0.35s
    const clickT = now + 0.35;
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(1950, clickT);
    clickOsc.frequency.exponentialRampToValueAtTime(820, clickT + 0.06);
    clickGain.gain.setValueAtTime(0.16, clickT);
    clickGain.gain.exponentialRampToValueAtTime(0.001, clickT + 0.07);
    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    clickOsc.start(clickT);
    clickOsc.stop(clickT + 0.08);
  }

  /**
   *BALANCE FAILURE OR SHOT BY RIFLE: Pitcher tips over in hand and spills water on the trail!
   */
  public playSpillCrash() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.25);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);

    this.playNoiseBurst(0.55, 620, 0.9, 0.32);
  }

  /**
   * CLIMAX SOUND 1: Loud, sharp, alarming ceramic & wood SNAP when the pitcher handle breaks!
   */
  public playHandleSnap() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    this.playNoiseBurst(0.11, 2400, 0.85, 0.75);

    const freqs = [1820, 1140, 620, 310];
    freqs.forEach((f, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.28, now + 0.18 + i * 0.04);

      gain.gain.setValueAtTime(0.42 / (i + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.22 + i * 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25 + i * 0.04);
    });
  }

  /**
   * CLIMAX SOUND 2: Loud, visceral CRASH & SHATTER sound in the final cutscene
   */
  public playPitcherShatter() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(165, now);
    boomOsc.frequency.exponentialRampToValueAtTime(24, now + 0.55);
    boomGain.gain.setValueAtTime(0.85, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    boomOsc.connect(boomGain);
    boomGain.connect(this.ctx.destination);
    boomOsc.start(now);
    boomOsc.stop(now + 0.62);

    this.playNoiseBurst(0.28, 1350, 0.55, 0.85);
    this.playNoiseBurst(0.45, 2800, 0.75, 0.65);

    const crashFreqs = [420, 690, 1080, 1540, 2190, 2870];
    crashFreqs.forEach((cf, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
      osc.frequency.setValueAtTime(cf, now);
      osc.frequency.exponentialRampToValueAtTime(cf * 0.42, now + 0.32);
      gain.gain.setValueAtTime(0.28 / (1 + i * 0.25), now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    });

    for (let i = 0; i < 24; i++) {
      const delay = i * 0.032 + Math.random() * 0.04;
      const t = now + delay;
      const shardOsc = this.ctx.createOscillator();
      const shardGain = this.ctx.createGain();
      shardOsc.type = i % 3 === 0 ? 'square' : 'triangle';
      const f = 850 + Math.random() * 2600;
      shardOsc.frequency.setValueAtTime(f, t);
      shardOsc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.085);

      shardGain.gain.setValueAtTime(0.26 * Math.pow(0.9, i), t);
      shardGain.gain.exponentialRampToValueAtTime(0.0005, t + 0.095);

      shardOsc.connect(shardGain);
      shardGain.connect(this.ctx.destination);
      shardOsc.start(t);
      shardOsc.stop(t + 0.1);
    }

    this.playNoiseBurst(0.85, 520, 0.7, 0.5);
  }

  /**
   * CLIMAX SOUND 3: Dramatic folkloric minor chord when the Czech proverb appears.
   */
  public playProverbChord() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const chord = [146.83, 220.0, 293.66, 349.23, 440.0];

    chord.forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 950;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.055 / (1 + i * 0.15), now + 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 4.5);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 4.6);
    });
  }

  /**
   * Dry metallic trigger click when trying to shoot the Rifle with 0 bullets.
   */
  public playEmptyClick() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1600, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.045);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  /**
   * Deep guttural bear roar when the bear spots a player off the road!
   */
  public playBearRoar() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const mod = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.linearRampToValueAtTime(145, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.85);

    mod.type = 'sawtooth';
    mod.frequency.value = 28;
    modGain.gain.value = 35;
    mod.connect(modGain);
    modGain.connect(osc.frequency);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.45, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    mod.start(now);
    osc.start(now);
    mod.stop(now + 0.92);
    osc.stop(now + 0.92);

    this.playNoiseBurst(0.65, 320, 1.1, 0.25);
  }

  /**
   * Bear swipe attack sound when hitting the player!
   */
  public playBearAttack() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    this.playBearRoar();
    this.playNoiseBurst(0.35, 240, 0.8, 0.55);
  }

  /**
   * Bear grunt when hit by a Rifle bullet (or deep groan on 9th fatal shot).
   */
  public playBearHit(killed = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const dur = killed ? 1.1 : 0.35;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(killed ? 130 : 165, now);
    osc.frequency.exponentialRampToValueAtTime(killed ? 38 : 78, now + dur);

    gain.gain.setValueAtTime(0.38, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  /**
   * "Leštit" action sound: 3 up-and-down strokes followed by 3 short piss streams in a row!
   */
  public playPolishAndPiss() {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    // Phase 1: 3 strokes (0.0s - 1.2s)
    [0.05, 0.48, 0.91].forEach((offset) => {
      if (!this.ctx) return;
      this.playNoiseBurstAt(now + offset, 0.22, 950, 2.2, 0.14);
    });

    // Phase 2: 3 short liquid streams in a row (1.35s, 1.85s, 2.35s)
    [1.35, 1.85, 2.35].forEach((offset) => {
      if (!this.ctx) return;
      this.playNoiseBurstAt(now + offset, 0.34, 1550, 1.6, 0.22);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now + offset);
      osc.frequency.exponentialRampToValueAtTime(760, now + offset + 0.3);
      gain.gain.setValueAtTime(0.05, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.34);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.35);
    });
  }

  /**
   * Jump & Bunnyhop sound
   */
  public playJump(isBhop = false) {
    this.init();
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = isBhop ? 165 : 130;
    const topFreq = isBhop ? 340 : 230;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(topFreq, now + 0.14);

    gain.gain.setValueAtTime(isBhop ? 0.22 : 0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  private playNoiseBurst(duration: number, centerFreq: number, q: number, volume: number) {
    if (!this.ctx) return;
    this.playNoiseBurstAt(this.ctx.currentTime, duration, centerFreq, q, volume);
  }

  private playNoiseBurstAt(
    startTime: number,
    duration: number,
    centerFreq: number,
    q: number,
    volume: number
  ) {
    if (!this.ctx) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = centerFreq;
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(startTime);
  }
}

export const soundEngine = new SoundEngine();
