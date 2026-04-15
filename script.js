/* ============================================================
   PAPULINES GALLERY — PHYSICS ENGINE & INTERACTION SYSTEM
   script.js
   ============================================================ */

(() => {
  'use strict';

  /* ── CONFIG ───────────────────────────────────────────── */
  const TOTAL        = 8;
  const BASE_SPEED   = 0.28;      // deg/frame auto-rotate
  const FRICTION     = 0.92;      // rotational damping
  const DRAG_SENS    = 0.45;      // drag→rotation sensitivity
  const SCROLL_SENS  = 0.4;       // scroll→rotation sensitivity
  const THROW_MULT   = 3.2;       // velocity amplifier on throw
  const FLOAT_SPRING = 0.12;      // floating card spring
  const FLOAT_DAMP   = 0.75;      // floating card damping
  const TILT_MAX     = 18;        // max card tilt on drag (deg)

  /* ── STATE ─────────────────────────────────────────────── */
  const state = {
    angle:     0,
    vel:       0,         // rotational velocity
    isDragging:false,
    isThrown:  false,
    lastX:     0,
    lastDX:    0,
    frameVels: [],        // recent frame velocities for throw calc
    paused:    false,

    // Floating card
    float: {
      active:  false,
      x:       0, y:       0,  // current position
      tx:      0, ty:      0,  // target position
      vx:      0, vy:      0,  // velocity
      tilt:    0,
      srcIndex:-1,
    },

    // Mouse
    mouse: { x: 0, y: 0 },
  };

  /* ── DOM REFS ──────────────────────────────────────────── */
  const carousel       = document.getElementById('carousel');
  const cards          = Array.from(document.querySelectorAll('.card'));
  const floatingCard   = document.getElementById('floatingCard');
  const floatingImg    = document.getElementById('floatingImg');
  const floatingClose  = document.getElementById('floatingClose');
  const floatingIndex  = floatingCard.querySelector('.floating-index');
  const cursor         = document.getElementById('cursor');
  const cursorFollower = document.getElementById('cursorFollower');
  const bgCanvas       = document.getElementById('bg-canvas');
  const ctx            = bgCanvas.getContext('2d');

  /* ── RADIUS (responsive) ────────────────────────────────── */
  function getRadius() {
    const w = window.innerWidth;
    if (w <= 600) return 310;
    if (w <= 900) return 420;
    return Math.min(680, w * 0.50);
  }

  /* ── POSITION CARDS IN 3D CIRCLE ───────────────────────── */
  function positionCards(rotY) {
    const r = getRadius();
    cards.forEach((card, i) => {
      const angle = (i / TOTAL) * 360 + rotY;
      const rad   = (angle * Math.PI) / 180;
      const tx    = Math.sin(rad) * r;
      const tz    = Math.cos(rad) * r;
      const rotCard = -angle;

      card.style.transform = `
        translateX(${tx}px)
        translateZ(${tz}px)
        rotateY(${rotCard}deg)
      `;

      // Depth-based opacity
      const normalized = (tz + r) / (2 * r); // 0…1
      const opacity = 0.55 + normalized * 0.45;
      card.style.opacity = card.classList.contains('grabbed') ? '0.3' : opacity;
    });
  }

  /* ── ANIMATION LOOP ─────────────────────────────────────── */
  let raf;
  function loop() {
    if (!state.isDragging) {
      if (state.isThrown) {
        state.vel *= FRICTION;
        if (Math.abs(state.vel) < 0.01) {
          state.vel = 0;
          state.isThrown = false;
        }
        state.angle += state.vel;
      } else {
        state.angle += BASE_SPEED;
      }
    }

    positionCards(state.angle);
    springFloatingCard();
    drawBg();
    raf = requestAnimationFrame(loop);
  }

  /* ── BACKGROUND PARTICLE SYSTEM ────────────────────────── */
  const particles = [];
  const PARTICLE_COUNT = 55;

  function initParticles() {
    bgCanvas.width  = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    particles.length = 0;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x:    Math.random() * bgCanvas.width,
        y:    Math.random() * bgCanvas.height,
        r:    Math.random() * 1.5 + 0.3,
        vx:   (Math.random() - 0.5) * 0.12,
        vy:   (Math.random() - 0.5) * 0.12,
        a:    Math.random() * 0.5 + 0.1,
        gold: Math.random() > 0.7,
      });
    }
  }

  function drawBg() {
    const W = bgCanvas.width;
    const H = bgCanvas.height;
    ctx.clearRect(0, 0, W, H);

    // Subtle vignette
    const vig = ctx.createRadialGradient(W/2, H/2, H*0.1, W/2, H/2, H*0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.gold
        ? `rgba(201,169,110,${p.a * 0.6})`
        : `rgba(240,237,232,${p.a * 0.25})`;
      ctx.fill();
    });

    // Mouse glow
    const mg = ctx.createRadialGradient(
      state.mouse.x, state.mouse.y, 0,
      state.mouse.x, state.mouse.y, 180
    );
    mg.addColorStop(0, 'rgba(201,169,110,0.06)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── CUSTOM CURSOR ──────────────────────────────────────── */
  let cfX = 0, cfY = 0; // cursor follower current pos

  function updateCursor(x, y) {
    state.mouse.x = x;
    state.mouse.y = y;
    cursor.style.left = x + 'px';
    cursor.style.top  = y + 'px';
    // Follower lags
    cfX += (x - cfX) * 0.14;
    cfY += (y - cfY) * 0.14;
    cursorFollower.style.left = cfX + 'px';
    cursorFollower.style.top  = cfY + 'px';
  }

  document.addEventListener('mousemove', e => {
    updateCursor(e.clientX, e.clientY);
  });

  /* ── FLOATING CARD SPRING PHYSICS ───────────────────────── */
  function springFloatingCard() {
    if (!state.float.active) return;

    const f = state.float;
    const dx = f.tx - f.x;
    const dy = f.ty - f.y;

    f.vx = f.vx * FLOAT_DAMP + dx * FLOAT_SPRING;
    f.vy = f.vy * FLOAT_DAMP + dy * FLOAT_SPRING;

    f.x += f.vx;
    f.y += f.vy;

    // Apply tilt based on velocity
    const targetTilt = f.vx * 0.6;
    f.tilt += (targetTilt - f.tilt) * 0.1;

    floatingCard.style.left = f.x + 'px';
    floatingCard.style.top  = f.y + 'px';
    floatingCard.style.setProperty('--tilt', f.tilt + 'deg');
    floatingCard.style.transform = `translate(-50%, -50%) scale(1) rotate(${f.tilt}deg)`;
  }

  /* ── SPAWN FLOATING CARD ────────────────────────────────── */
  function spawnFloat(card, originX, originY) {
    const idx   = parseInt(card.dataset.index);
    const img   = card.querySelector('img');
    const num   = idx + 1;

    floatingImg.src = img.src;
    floatingImg.alt = img.alt;
    floatingIndex.textContent = String(num).padStart(2, '0');

    state.float.x  = originX;
    state.float.y  = originY;
    state.float.tx = originX;
    state.float.ty = originY;
    state.float.vx = 0;
    state.float.vy = 0;
    state.float.tilt = -4 + Math.random() * 8;
    state.float.active  = true;
    state.float.srcIndex = idx;

    floatingCard.style.left = originX + 'px';
    floatingCard.style.top  = originY + 'px';
    floatingCard.classList.add('visible');
    card.classList.add('grabbed');
    document.body.classList.add('dragging');
  }

  function dismissFloat() {
    if (!state.float.active) return;

    // Snap float back & shrink
    floatingCard.classList.remove('visible');
    state.float.active = false;

    cards.forEach(c => c.classList.remove('grabbed'));
    document.body.classList.remove('dragging');
  }

  /* ── DRAG LOGIC (mouse) ─────────────────────────────────── */
  let dragCard = null;

  cards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      if (!state.isDragging) card.classList.add('hovered');
    });
    card.addEventListener('mouseleave', () => {
      card.classList.remove('hovered');
    });

    card.addEventListener('mousedown', e => {
      e.preventDefault();
      dragCard = card;
      state.isDragging = true;
      state.isThrown   = false;
      state.lastX      = e.clientX;
      state.lastDX     = 0;
      state.frameVels  = [];
      card.classList.remove('hovered');

      // Spawn the floating clone
      spawnFloat(card, e.clientX, e.clientY);
    });
  });

  document.addEventListener('mousemove', e => {
    if (!state.isDragging) return;

    const dx = e.clientX - state.lastX;
    state.lastX = e.clientX;
    // Negative so dragging right moves carousel to the right (natural feel)
    state.angle -= dx * DRAG_SENS;
    state.lastDX = dx;
    state.frameVels.push(dx);
    if (state.frameVels.length > 6) state.frameVels.shift();

    // Update floating card target
    if (state.float.active) {
      state.float.tx = e.clientX;
      state.float.ty = e.clientY;
    }
  });

  document.addEventListener('mouseup', e => {
    if (!state.isDragging) return;
    state.isDragging = false;

    // Calculate throw velocity — negate to match drag direction
    const avgDX = state.frameVels.length
      ? state.frameVels.reduce((a, b) => a + b, 0) / state.frameVels.length
      : 0;

    state.vel = -avgDX * DRAG_SENS * THROW_MULT;
    state.isThrown = Math.abs(state.vel) > 0.05;

    dismissFloat();
    dragCard = null;
  });

  /* ── DRAG LOGIC (touch) ─────────────────────────────────── */
  let touchStartX = 0;
  let touchLastX  = 0;
  let touchCard   = null;
  let touchMoved  = false;

  document.addEventListener('touchstart', e => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchLastX  = touch.clientX;
    touchMoved  = false;
    state.frameVels = [];
    state.isThrown  = false;

    // Find touched card
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    touchCard = el ? el.closest('.card') : null;

    if (touchCard) {
      state.isDragging = true;
      spawnFloat(touchCard, touch.clientX, touch.clientY);
    }
  }, { passive: true });

  document.addEventListener('touchmove', e => {
    const touch = e.touches[0];
    const dx = touch.clientX - touchLastX;
    touchLastX = touch.clientX;
    touchMoved = true;

    if (state.isDragging) {
      state.angle -= dx * DRAG_SENS;
      state.frameVels.push(dx);
      if (state.frameVels.length > 6) state.frameVels.shift();

      if (state.float.active) {
        state.float.tx = touch.clientX;
        state.float.ty = touch.clientY;
      }
    }
    // Update cursor follower on touch
    updateCursor(touch.clientX, touch.clientY);
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (state.isDragging) {
      const avgDX = state.frameVels.length
        ? state.frameVels.reduce((a, b) => a + b, 0) / state.frameVels.length
        : 0;
      state.vel = -avgDX * DRAG_SENS * THROW_MULT;
      state.isThrown = Math.abs(state.vel) > 0.05;
      state.isDragging = false;
      dismissFloat();
      touchCard = null;
    }
  });

  /* ── SCROLL TO ROTATE ───────────────────────────────────── */
  document.addEventListener('wheel', e => {
    e.preventDefault();
    state.vel      = e.deltaY * SCROLL_SENS * 0.04;
    state.isThrown = true;
    state.isDragging = false;
  }, { passive: false });

  /* ── CLOSE FLOATING CARD ────────────────────────────────── */
  floatingClose.addEventListener('click', dismissFloat);

  /* ── KEYBOARD ───────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { state.vel =  2.5; state.isThrown = true; }
    if (e.key === 'ArrowLeft')  { state.vel = -2.5; state.isThrown = true; }
    if (e.key === 'Escape')     { dismissFloat(); }
  });

  /* ── RESIZE ─────────────────────────────────────────────── */
  window.addEventListener('resize', () => {
    bgCanvas.width  = window.innerWidth;
    bgCanvas.height = window.innerHeight;
  });

  /* ── HOVER: card tilt on mouse move within card ─────────── */
  cards.forEach(card => {
    card.addEventListener('mousemove', e => {
      if (state.isDragging) return;
      const rect = card.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const rx   = ((e.clientX - cx) / (rect.width  / 2)) * TILT_MAX;
      const ry   = ((e.clientY - cy) / (rect.height / 2)) * TILT_MAX;
      card.querySelector('.card-inner').style.transform =
        `translateZ(28px) scale(1.04) rotateY(${rx * 0.5}deg) rotateX(${-ry * 0.4}deg)`;
    });

    card.addEventListener('mouseleave', () => {
      const inner = card.querySelector('.card-inner');
      inner.style.transform = '';
    });
  });

  /* ── INIT ───────────────────────────────────────────────── */
  function init() {
    bgCanvas.width  = window.innerWidth;
    bgCanvas.height = window.innerHeight;
    initParticles();
    positionCards(state.angle);
    loop();
  }

  init();

})();
