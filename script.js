/* ============================================================
   NEON RUN 3D — Motor WebGL nativo, sin dependencias.
   ============================================================ */
(function () {
  'use strict';

  const CFG = {
    startZ: 10,
    finishZ: -2080,
    lanes: [-3.65, 0, 3.65],
    trackWidth: 12.8,
    halfWidth: 6.4,
    maxLives: 3,
    baseSpeed: 23,
    boostSpeed: 35,
    brakeSpeed: 10.5,
    jumpVelocity: 9.7,
    gravity: 27,
    fogNear: 42,
    fogFar: 178,
    magnetDuration: 8,
    coinValue: 100,
    finishBonus: 1500,
    lifeBonus: 500
  };

  // Tres tramos de una misma pista. El jugador avanza de forma continua:
  // cada meta de nivel es la salida del siguiente.
  const LEVELS = [
    {
      id: 1, name: 'CIUDAD NEÓN', startZ: CFG.startZ, finishZ: -690,
      baseSpeed: 21, boostSpeed: 30, brakeSpeed: 9.5,
      coinGap: [17, 34], coinGroup: [3, 5], sideCoins: 0.42, waveCoins: false,
      obstacleStart: 120, obstacleGap: [90, 122], pattern: [0.58, 0.30, 0.12], combo: 0,
      magnetAt: [0.38, 0.72]
    },
    {
      id: 2, name: 'PISTA NEÓN AVANZADA', startZ: -690, finishZ: -1380,
      baseSpeed: 25.2, boostSpeed: 36, brakeSpeed: 10.5,
      coinGap: [13, 25], coinGroup: [4, 7], sideCoins: 0.72, waveCoins: false,
      obstacleStart: 78, obstacleGap: [66, 92], pattern: [0.40, 0.34, 0.26], combo: 0.18,
      magnetAt: [0.36, 0.70]
    },
    {
      id: 3, name: 'DESAFÍO NEÓN FINAL', startZ: -1380, finishZ: CFG.finishZ,
      baseSpeed: 30.5, boostSpeed: 44, brakeSpeed: 12,
      coinGap: [11, 21], coinGroup: [5, 8], sideCoins: 0.9, waveCoins: true,
      obstacleStart: 64, obstacleGap: [48, 70], pattern: [0.30, 0.34, 0.36], combo: 0.42,
      magnetAt: [0.32, 0.58, 0.82]
    }
  ];

  const COLORS = {
    cyan: [0.22, 0.94, 1.0], cyanDeep: [0.03, 0.54, 0.74],
    pink: [1.0, 0.16, 0.82], violet: [0.46, 0.25, 1.0],
    gold: [1.0, 0.72, 0.18], goldBright: [1.0, 0.94, 0.58],
    white: [0.96, 0.98, 1.0], red: [1.0, 0.12, 0.28],
    green: [0.22, 1.0, 0.62]
  };
  const FOG_COLOR = [0.072, 0.028, 0.150];

  const $ = (id) => document.getElementById(id);
  const canvas = $('game-canvas');
  const ui = {
    hud: $('hud'), lives: $('lives'), score: $('hud-score'), coins: $('hud-coins'),
    distance: $('hud-distance'), speed: $('hud-speed'), speedFill: $('speed-fill'),
    level: $('hud-level'), levelName: $('hud-level-name'),
    progressFill: $('progress-fill'), progressRunner: $('progress-runner'), progressPercent: $('progress-percent'),
    combo: $('combo'), comboValue: $('combo-value'), powerup: $('powerup-badge'), powerupTime: $('powerup-time'),
    countdown: $('countdown'), toast: $('toast'), damage: $('damage-flash'),
    menu: $('screen-menu'), help: $('screen-help'), pause: $('screen-pause'),
    levelScreen: $('screen-level'), levelNumber: $('level-complete-number'),
    levelCopy: $('level-transition-copy'), levelScore: $('level-score'), levelCoins: $('level-coins'),
    levelLives: $('level-lives'), levelPosition: $('level-position'), levelTime: $('level-time'),
    levelSteps: $('level-steps'), btnNextLevel: $('btn-next-level'), btnLevelMenu: $('btn-level-menu'),
    victory: $('screen-victory'), victoryCopy: $('victory-copy'), defeat: $('screen-defeat'), loading: $('screen-loading'), fatal: $('screen-fatal'),
    loadingFill: $('loading-fill'), bestScore: $('best-score'), bestCoins: $('best-coins'),
    pauseScore: $('pause-score'), pauseCoins: $('pause-coins'), pauseDistance: $('pause-distance'),
    victoryScore: $('victory-score'), victoryCoins: $('victory-coins'), victoryTime: $('victory-time'),
    victoryLives: $('victory-lives'), victoryBest: $('victory-best'), victoryRecord: $('victory-record'),
    defeatScore: $('defeat-score'), defeatCoins: $('defeat-coins'), defeatDistance: $('defeat-distance'),
    defeatLevel: $('defeat-level'), defeatBest: $('defeat-best'), defeatRecord: $('defeat-record'), soundIcon: $('sound-icon'),
    btnSound: $('btn-sound'), btnPause: $('btn-pause'), touch: $('touch-actions'), fatalMsg: $('fatal-msg')
  };

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
  const rand = (a, b) => a + Math.random() * (b - a);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const hexToRgb = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  const M4 = {
    create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
    multiply(out, a, b) {
      const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],
            a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
      for (let i=0;i<4;i++){
        const b0=b[i*4],b1=b[i*4+1],b2=b[i*4+2],b3=b[i*4+3];
        out[i*4]=b0*a00+b1*a10+b2*a20+b3*a30;
        out[i*4+1]=b0*a01+b1*a11+b2*a21+b3*a31;
        out[i*4+2]=b0*a02+b1*a12+b2*a22+b3*a32;
        out[i*4+3]=b0*a03+b1*a13+b2*a23+b3*a33;
      }
      return out;
    },
    compose(out, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
      sx=sx===undefined?1:sx; sy=sy===undefined?1:sy; sz=sz===undefined?1:sz;
      const cx=Math.cos(rx), sxr=Math.sin(rx), cy=Math.cos(ry), syr=Math.sin(ry), cz=Math.cos(rz), szr=Math.sin(rz);
      const c0x=cz*cy-szr*sxr*syr, c0y=szr*cy+cz*sxr*syr, c0z=-cx*syr;
      const c1x=-szr*cx, c1y=cz*cx, c1z=sxr;
      const c2x=cz*syr+szr*sxr*cy, c2y=szr*syr-cz*sxr*cy, c2z=cx*cy;
      out[0]=c0x*sx;out[1]=c0y*sx;out[2]=c0z*sx;out[3]=0;
      out[4]=c1x*sy;out[5]=c1y*sy;out[6]=c1z*sy;out[7]=0;
      out[8]=c2x*sz;out[9]=c2y*sz;out[10]=c2z*sz;out[11]=0;
      out[12]=tx;out[13]=ty;out[14]=tz;out[15]=1;
      return out;
    },
    perspective(out, fovy, aspect, near, far) {
      const f=1/Math.tan(fovy/2); out.fill(0); out[0]=f/aspect; out[5]=f;
      out[10]=(far+near)/(near-far); out[11]=-1; out[14]=(2*far*near)/(near-far); return out;
    },
    lookAt(out, eye, center, up) {
      let zx=eye[0]-center[0],zy=eye[1]-center[1],zz=eye[2]-center[2];
      let len=Math.hypot(zx,zy,zz)||1; zx/=len;zy/=len;zz/=len;
      let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;
      len=Math.hypot(xx,xy,xz)||1; xx/=len;xy/=len;xz/=len;
      const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
      out[0]=xx;out[1]=yx;out[2]=zx;out[3]=0;
      out[4]=xy;out[5]=yy;out[6]=zy;out[7]=0;
      out[8]=xz;out[9]=yz;out[10]=zz;out[11]=0;
      out[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
      out[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
      out[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
      out[15]=1; return out;
    }
  };

  // ---------------------------------------------------------------- WebGL
  let gl = null;
  try {
    gl = canvas.getContext('webgl', {alpha:false,antialias:true,depth:true,stencil:false,powerPreference:'high-performance'}) || canvas.getContext('experimental-webgl');
  } catch (e) { gl = null; }
  if (!gl) {
    ui.loading.classList.add('is-hidden');
    ui.fatal.classList.remove('is-hidden');
    return;
  }

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(log);
    }
    return s;
  }
  function program(vs, fs, name) {
    const p = gl.createProgram(), v = shader(gl.VERTEX_SHADER, vs), f = shader(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(name + ': ' + gl.getProgramInfoLog(p));
    gl.deleteShader(v); gl.deleteShader(f); return p;
  }

  const V_MESH = `
    attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor; attribute float aEmissive;
    uniform mat4 uProjection,uView,uModel;
    varying vec3 vNormal,vColor,vWorld; varying float vEmissive,vDepth;
    void main(){
      vec4 world=uModel*vec4(aPosition,1.0); vec4 view=uView*world;
      gl_Position=uProjection*view; vNormal=normalize(mat3(uModel)*aNormal);
      vColor=aColor; vWorld=world.xyz; vEmissive=aEmissive; vDepth=-view.z;
    }`;
  const F_MESH = `
    precision mediump float;
    uniform vec3 uFogColor,uCameraPos; uniform float uFogNear,uFogFar,uGlow,uAlpha;
    varying vec3 vNormal,vColor,vWorld; varying float vEmissive,vDepth;
    void main(){
      vec3 N=normalize(vNormal), L=normalize(vec3(-0.42,0.86,0.46)), V=normalize(uCameraPos-vWorld);
      float diff=max(dot(N,L),0.0); float back=max(dot(N,normalize(vec3(0.72,0.2,-0.5))),0.0);
      // Luz de relleno que viene de la cámara: evita que el runner quede a oscuras.
      float fill=max(dot(N,V),0.0);
      float rim=pow(1.0-max(dot(N,V),0.0),2.5);
      vec3 lit=vColor*(0.42+0.62*diff+0.22*back+0.3*fill)+vColor*rim*(0.22+vEmissive*0.8);
      vec3 col=lit+vColor*vEmissive*uGlow*2.3;
      float fog=smoothstep(uFogNear,uFogFar,vDepth);
      gl_FragColor=vec4(mix(col,uFogColor,fog*0.94),uAlpha);
    }`;
  const V_TRACK = `
    attribute vec3 aPosition; uniform mat4 uProjection,uView;
    varying vec3 vWorld; varying float vDepth;
    void main(){ vec4 view=uView*vec4(aPosition,1.0); gl_Position=uProjection*view; vWorld=aPosition; vDepth=-view.z; }`;
  const F_TRACK = `
    precision mediump float;
    uniform float uTime,uSpeed,uFinish,uFogNear,uFogFar; uniform vec3 uFogColor;
    varying vec3 vWorld; varying float vDepth;
    float lineAA(float v,float w){return 1.0-smoothstep(0.0,w,abs(v));}
    void main(){
      float x=vWorld.x,z=vWorld.z,ax=abs(x);
      float panel=step(0.5,fract((z+4.0)/14.0));
      vec3 base=mix(vec3(0.040,0.016,0.082),vec3(0.068,0.028,0.132),panel);
      base+=vec3(0.030,0.010,0.058)*(1.0-smoothstep(0.0,5.8,ax));
      float zLine=lineAA(fract(z/6.0),0.035), zLineBig=lineAA(fract(z/24.0),0.012);
      float lane=lineAA(abs(x)-1.83,0.038)*step(ax,5.6);
      float dash=step(0.4,fract((z-uTime*(4.0+uSpeed*0.2))/4.6));
      float laneGlow=lane*(0.16+dash*0.34);
      float edgeL=1.0-smoothstep(0.055,0.12,abs(x+6.0));
      float edgeR=1.0-smoothstep(0.055,0.12,abs(x-6.0));
      float edgeIn=1.0-smoothstep(0.02,0.06,min(abs(ax-5.85),abs(ax-6.15)));
      vec3 col=base+vec3(0.14,0.68,0.88)*zLine*0.22+vec3(0.18,0.07,0.42)*zLineBig*0.28;
      col+=vec3(0.28,0.20,0.86)*laneGlow+vec3(0.10,0.90,1.0)*edgeL*1.35+vec3(1.0,0.10,0.78)*edgeR*1.25+vec3(0.40,0.32,0.96)*edgeIn*0.35;
      float fin=1.0-smoothstep(0.0,12.0,abs(z-uFinish));
      col+=vec3(1.0,0.72,0.18)*fin*(0.18+(1.0-smoothstep(0.0,1.5,abs(z-uFinish)))*0.6);
      float pulse=0.5+0.5*sin(z*0.22+uTime*5.0);
      col+=vec3(0.20,0.04,0.30)*(1.0-smoothstep(0.0,1.6,abs(x)))*pulse*0.09;
      float fog=smoothstep(uFogNear,uFogFar,vDepth);
      gl_FragColor=vec4(mix(col,uFogColor,fog*0.97),1.0);
    }`;
  const V_SKY = `
    attribute vec2 aPosition; varying vec2 vUv;
    void main(){ vUv=aPosition*0.5+0.5; gl_Position=vec4(aPosition,0.999,1.0); }`;
  const F_SKY = `
    precision mediump float;
    uniform float uTime,uAspect; uniform vec2 uParallax; varying vec2 vUv;
    float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
    void main(){
      vec2 uv=vUv;
      vec3 top=vec3(0.030,0.012,0.085),mid=vec3(0.105,0.030,0.220),horizon=vec3(0.200,0.055,0.330);
      float h=smoothstep(0.0,1.0,uv.y);
      vec3 col=mix(horizon,mid,smoothstep(0.12,0.58,h)); col=mix(col,top,smoothstep(0.55,1.0,h));
      col+=vec3(0.03,0.38,0.72)*exp(-pow((uv.y-0.36)*8.0,2.0))*0.42;
      col+=vec3(0.55,0.02,0.45)*exp(-pow((uv.y-0.29)*12.0,2.0))*0.28;
      vec2 sp=vec2((uv.x-(0.71-uParallax.x*0.002))*uAspect,uv.y-0.48);
      float sd=length(sp),disk=1.0-smoothstep(0.085,0.10,sd),halo=1.0-smoothstep(0.10,0.33,sd);
      float cuts=step(0.46,fract((uv.y-0.36)*32.0));
      col+=vec3(1.0,0.32,0.66)*disk*(0.36+cuts*0.32)+vec3(1.0,0.12,0.56)*halo*0.10+vec3(1.0,0.65,0.35)*halo*0.035;
      vec2 grid=vec2((uv.x+uParallax.x*0.003)*uAspect,uv.y+uParallax.y*0.001)*95.0;
      vec2 id=floor(grid),f=fract(grid)-0.5;
      float rnd=hash21(id); float star=step(0.982,rnd)*(1.0-smoothstep(0.0,0.24,length(f)));
      float tw=0.55+0.45*sin(uTime*(1.1+rnd*2.0)+rnd*40.0);
      vec3 sc=mix(vec3(0.55,0.90,1.0),vec3(1.0,0.55,0.94),hash21(id+3.2));
      col+=sc*star*tw*1.1*smoothstep(0.28,0.55,uv.y);
      float neb=sin((uv.x*7.0+uTime*0.006)+sin(uv.y*9.0))*0.5+0.5;
      col+=vec3(0.07,0.01,0.13)*pow(neb,3.0)*smoothstep(0.1,0.75,uv.y)*0.4;
      gl_FragColor=vec4(col,1.0);
    }`;
  const V_PART = `
    attribute vec3 aPosition,aColor; attribute float aSize,aAlpha;
    uniform mat4 uProjection,uView; uniform float uPixelRatio;
    varying vec3 vColor; varying float vAlpha;
    void main(){
      vec4 view=uView*vec4(aPosition,1.0); gl_Position=uProjection*view;
      gl_PointSize=clamp(aSize*uPixelRatio*(150.0/max(-view.z,1.0)),1.0,42.0);
      vColor=aColor; vAlpha=aAlpha;
    }`;
  const F_PART = `
    precision mediump float; varying vec3 vColor; varying float vAlpha;
    void main(){
      vec2 p=gl_PointCoord-vec2(0.5); float d=length(p)*2.0;
      float core=1.0-smoothstep(0.0,1.0,d),halo=1.0-smoothstep(0.0,0.5,d);
      gl_FragColor=vec4(vColor*(core+halo*0.7)*1.6,core*vAlpha);
    }`;
  const F_BRIGHT = `
    precision mediump float; uniform sampler2D uTexture; uniform float uThreshold; varying vec2 vUv;
    void main(){vec3 c=texture2D(uTexture,vUv).rgb; float l=max(max(c.r,c.g),c.b);
      gl_FragColor=vec4(c*smoothstep(uThreshold,uThreshold+0.32,l),1.0);}`;
  const F_BLUR = `
    precision mediump float; uniform sampler2D uTexture; uniform vec2 uDirection; varying vec2 vUv;
    void main(){
      vec3 s=texture2D(uTexture,vUv).rgb*0.227027;
      s+=texture2D(uTexture,vUv+uDirection*1.384615).rgb*0.316216;
      s+=texture2D(uTexture,vUv-uDirection*1.384615).rgb*0.316216;
      s+=texture2D(uTexture,vUv+uDirection*3.230769).rgb*0.070270;
      s+=texture2D(uTexture,vUv-uDirection*3.230769).rgb*0.070270;
      gl_FragColor=vec4(s,1.0);
    }`;
  const F_POST = `
    precision mediump float;
    uniform sampler2D uScene,uBloom; uniform vec2 uResolution; uniform float uTime,uBloomStrength;
    varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    void main(){
      vec2 uv=vUv,center=uv-0.5; float r2=dot(center,center);
      float ab=0.0016*(0.25+r2*2.4); vec3 col;
      col.r=texture2D(uScene,uv+center*ab).r; col.g=texture2D(uScene,uv).g; col.b=texture2D(uScene,uv-center*ab).b;
      col+=texture2D(uBloom,uv).rgb*uBloomStrength;
      col=pow(max(col,0.0),vec3(0.94));
      float vig=1.0-smoothstep(0.24,0.92,length(center)*1.18); col*=0.68+vig*0.32;
      col+=sin(uv.y*uResolution.y*1.35+uTime*2.0)*0.006;
      col+=(hash(uv*uResolution+uTime*8.0)-0.5)*0.014;
      gl_FragColor=vec4(max(col,0.0),1.0);
    }`;

  let meshProgram, trackProgram, skyProgram, partProgram, brightProgram, blurProgram, postProgram;
  try {
    meshProgram = program(V_MESH, F_MESH, 'mesh');
    trackProgram = program(V_TRACK, F_TRACK, 'track');
    skyProgram = program(V_SKY, F_SKY, 'sky');
    partProgram = program(V_PART, F_PART, 'particles');
    brightProgram = program(V_SKY, F_BRIGHT, 'bright');
    blurProgram = program(V_SKY, F_BLUR, 'blur');
    postProgram = program(V_SKY, F_POST, 'post');
  } catch (err) {
    console.error(err);
    ui.loading.classList.add('is-hidden');
    ui.fatal.classList.remove('is-hidden');
    return;
  }

  const U = {
    mesh: {
      position: gl.getAttribLocation(meshProgram, 'aPosition'), normal: gl.getAttribLocation(meshProgram, 'aNormal'),
      color: gl.getAttribLocation(meshProgram, 'aColor'), emissive: gl.getAttribLocation(meshProgram, 'aEmissive'),
      projection: gl.getUniformLocation(meshProgram, 'uProjection'), view: gl.getUniformLocation(meshProgram, 'uView'),
      model: gl.getUniformLocation(meshProgram, 'uModel'), fogColor: gl.getUniformLocation(meshProgram, 'uFogColor'),
      fogNear: gl.getUniformLocation(meshProgram, 'uFogNear'), fogFar: gl.getUniformLocation(meshProgram, 'uFogFar'),
      glow: gl.getUniformLocation(meshProgram, 'uGlow'), alpha: gl.getUniformLocation(meshProgram, 'uAlpha'),
      cameraPos: gl.getUniformLocation(meshProgram, 'uCameraPos')
    },
    track: {
      position: gl.getAttribLocation(trackProgram, 'aPosition'), projection: gl.getUniformLocation(trackProgram, 'uProjection'),
      view: gl.getUniformLocation(trackProgram, 'uView'), time: gl.getUniformLocation(trackProgram, 'uTime'),
      speed: gl.getUniformLocation(trackProgram, 'uSpeed'), finish: gl.getUniformLocation(trackProgram, 'uFinish'),
      fogColor: gl.getUniformLocation(trackProgram, 'uFogColor'), fogNear: gl.getUniformLocation(trackProgram, 'uFogNear'),
      fogFar: gl.getUniformLocation(trackProgram, 'uFogFar')
    },
    sky: { position: gl.getAttribLocation(skyProgram, 'aPosition'), time: gl.getUniformLocation(skyProgram, 'uTime'),
      aspect: gl.getUniformLocation(skyProgram, 'uAspect'), parallax: gl.getUniformLocation(skyProgram, 'uParallax') },
    part: { position: gl.getAttribLocation(partProgram, 'aPosition'), color: gl.getAttribLocation(partProgram, 'aColor'),
      size: gl.getAttribLocation(partProgram, 'aSize'), alpha: gl.getAttribLocation(partProgram, 'aAlpha'),
      projection: gl.getUniformLocation(partProgram, 'uProjection'), view: gl.getUniformLocation(partProgram, 'uView'),
      pixelRatio: gl.getUniformLocation(partProgram, 'uPixelRatio') },
    bright: { position: gl.getAttribLocation(brightProgram, 'aPosition'), texture: gl.getUniformLocation(brightProgram, 'uTexture'),
      threshold: gl.getUniformLocation(brightProgram, 'uThreshold') },
    blur: { position: gl.getAttribLocation(blurProgram, 'aPosition'), texture: gl.getUniformLocation(blurProgram, 'uTexture'),
      direction: gl.getUniformLocation(blurProgram, 'uDirection') },
    post: { position: gl.getAttribLocation(postProgram, 'aPosition'), scene: gl.getUniformLocation(postProgram, 'uScene'),
      bloom: gl.getUniformLocation(postProgram, 'uBloom'), resolution: gl.getUniformLocation(postProgram, 'uResolution'),
      time: gl.getUniformLocation(postProgram, 'uTime'), strength: gl.getUniformLocation(postProgram, 'uBloomStrength') }
  };

  const fsQuad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fsQuad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);

  // ---------------------------------------------------------- mallas
  function builder() { return {p:[],n:[],c:[],e:[]}; }
  function vertex(b, px,py,pz, nx,ny,nz, col, em) {
    b.p.push(px,py,pz); b.n.push(nx,ny,nz); b.c.push(col[0],col[1],col[2]); b.e.push(em||0);
  }
  function tri(b,a,c,d,n,col,em) {
    vertex(b,a[0],a[1],a[2],n[0],n[1],n[2],col,em);
    vertex(b,c[0],c[1],c[2],n[0],n[1],n[2],col,em);
    vertex(b,d[0],d[1],d[2],n[0],n[1],n[2],col,em);
  }
  function quad(b,a,c,d,e,n,col,em) { tri(b,a,c,d,n,col,em); tri(b,a,d,e,n,col,em); }
  function box(b,cx,cy,cz,w,h,d,col,em) {
    em=em||0; const x0=cx-w/2,x1=cx+w/2,y0=cy-h/2,y1=cy+h/2,z0=cz-d/2,z1=cz+d/2;
    quad(b,[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],[x1,y0,z0],[1,0,0],col,em);
    quad(b,[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1],[-1,0,0],col,em);
    quad(b,[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],[0,1,0],col,em);
    quad(b,[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0],col,em);
    quad(b,[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1],col,em);
    quad(b,[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[0,0,-1],col,em);
  }
  function cylinder(b,cx,cy,cz,r,h,seg,col,em,axis) {
    axis=axis||'y'; em=em||0; const half=h/2,tau=Math.PI*2;
    for(let i=0;i<seg;i++){
      const a0=i/seg*tau,a1=(i+1)/seg*tau,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
      if(axis==='y'){
        quad(b,[cx+c0*r,cy-half,cz+s0*r],[cx+c1*r,cy-half,cz+s1*r],[cx+c1*r,cy+half,cz+s1*r],[cx+c0*r,cy+half,cz+s0*r],[c0,0,s0],col,em);
        tri(b,[cx,cy+half,cz],[cx+c0*r,cy+half,cz+s0*r],[cx+c1*r,cy+half,cz+s1*r],[0,1,0],col,em);
        tri(b,[cx,cy-half,cz],[cx+c1*r,cy-half,cz+s1*r],[cx+c0*r,cy-half,cz+s0*r],[0,-1,0],col,em);
      } else if(axis==='z'){
        quad(b,[cx+c0*r,cy+s0*r,cz-half],[cx+c1*r,cy+s1*r,cz-half],[cx+c1*r,cy+s1*r,cz+half],[cx+c0*r,cy+s0*r,cz+half],[c0,s0,0],col,em);
        tri(b,[cx,cy,cz+half],[cx+c0*r,cy+s0*r,cz+half],[cx+c1*r,cy+s1*r,cz+half],[0,0,1],col,em);
        tri(b,[cx,cy,cz-half],[cx+c1*r,cy+s1*r,cz-half],[cx+c0*r,cy+s0*r,cz-half],[0,0,-1],col,em);
      } else {
        quad(b,[cx-half,cy+c0*r,cz+s0*r],[cx-half,cy+c1*r,cz+s1*r],[cx+half,cy+c1*r,cz+s1*r],[cx+half,cy+c0*r,cz+s0*r],[0,c0,s0],col,em);
        tri(b,[cx+half,cy,cz],[cx+half,cy+c0*r,cz+s0*r],[cx+half,cy+c1*r,cz+s1*r],[1,0,0],col,em);
        tri(b,[cx-half,cy,cz],[cx-half,cy+c1*r,cz+s1*r],[cx-half,cy+c0*r,cz+s0*r],[-1,0,0],col,em);
      }
    }
  }
  function sphere(b,cx,cy,cz,r,seg,rings,col,em) {
    em=em||0;
    for(let rr=0;rr<rings;rr++){
      const v0=rr/rings*Math.PI,v1=(rr+1)/rings*Math.PI;
      for(let cc=0;cc<seg;cc++){
        const u0=cc/seg*Math.PI*2,u1=(cc+1)/seg*Math.PI*2;
        const p0=[cx+r*Math.sin(v0)*Math.cos(u0),cy+r*Math.cos(v0),cz+r*Math.sin(v0)*Math.sin(u0)];
        const p1=[cx+r*Math.sin(v0)*Math.cos(u1),cy+r*Math.cos(v0),cz+r*Math.sin(v0)*Math.sin(u1)];
        const p2=[cx+r*Math.sin(v1)*Math.cos(u1),cy+r*Math.cos(v1),cz+r*Math.sin(v1)*Math.sin(u1)];
        const p3=[cx+r*Math.sin(v1)*Math.cos(u0),cy+r*Math.cos(v1),cz+r*Math.sin(v1)*Math.sin(u0)];
        const nx=Math.sin((v0+v1)/2)*Math.cos((u0+u1)/2),ny=Math.cos((v0+v1)/2),nz=Math.sin((v0+v1)/2)*Math.sin((u0+u1)/2);
        quad(b,p0,p1,p2,p3,[nx,ny,nz],col,em);
      }
    }
  }
  function torus(b,cx,cy,cz,major,minor,segU,segV,col,em,axis) {
    axis=axis||'z'; em=em||0;
    for(let i=0;i<segU;i++){
      const u0=i/segU*Math.PI*2,u1=(i+1)/segU*Math.PI*2,cu0=Math.cos(u0),su0=Math.sin(u0),cu1=Math.cos(u1),su1=Math.sin(u1);
      for(let j=0;j<segV;j++){
        const v0=j/segV*Math.PI*2,v1=(j+1)/segV*Math.PI*2,cv0=Math.cos(v0),sv0=Math.sin(v0),cv1=Math.cos(v1),sv1=Math.sin(v1);
        const r0=major+minor*cv0,r1=major+minor*cv1; let p0,p1,p2,p3,n0,n1;
        if(axis==='z'){
          p0=[cx+r0*cu0,cy+r0*su0,cz+minor*sv0]; p1=[cx+r0*cu1,cy+r0*su1,cz+minor*sv0];
          p2=[cx+r1*cu1,cy+r1*su1,cz+minor*sv1]; p3=[cx+r1*cu0,cy+r1*su0,cz+minor*sv1];
          n0=[cv0*cu0,cv0*su0,sv0]; n1=[cv1*cu0,cv1*su0,sv1];
        } else {
          p0=[cx+r0*cu0,cy+minor*sv0,cz+r0*su0]; p1=[cx+r0*cu1,cy+minor*sv0,cz+r0*su1];
          p2=[cx+r1*cu1,cy+minor*sv1,cz+r1*su1]; p3=[cx+r1*cu0,cy+minor*sv1,cz+r1*su0];
          n0=[cv0*cu0,sv0,cv0*su0]; n1=[cv1*cu0,sv1,cv1*su0];
        }
        tri(b,p0,p1,p2,n0,col,em); tri(b,p0,p2,p3,n1,col,em);
      }
    }
  }
  function upload(b) {
    const mesh={count:b.p.length/3,buffers:{}};
    const keys=['p','n','c','e'], names=['position','normal','color','emissive'];
    for(let i=0;i<4;i++){
      const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(b[keys[i]]),gl.STATIC_DRAW); mesh.buffers[names[i]]=buf;
    }
    return mesh;
  }

  // ---------------------------------------------------------- entorno
  const bodyColors=['#0b051a','#100724','#15092d','#080413','#0d0820'];
  const neonColors=[COLORS.cyan,COLORS.pink,COLORS.violet,COLORS.gold];

  function addBuilding(b,x,z,w,h,d,rng){
    const level=cityLevelAtZ(z);
    const accents=level===2?[COLORS.cyan,COLORS.pink,COLORS.violet,COLORS.red,COLORS.gold]:(level===1?neonColors:[COLORS.cyan,COLORS.pink,COLORS.violet]);
    const accent=accents[(rng()*accents.length)|0];
    const body=hexToRgb(CITY_BODY_COLORS[level][(rng()*CITY_BODY_COLORS[level].length)|0]);
    const win=rng()>0.55?COLORS.cyan:(rng()>0.4?COLORS.violet:COLORS.pink);
    const inner=x>0?x-w/2-0.02:x+w/2+0.02;
    const front=z+d/2+0.02;
    box(b,x,h/2-0.35,z,w,h,d,body,0.02);
    box(b,x,h+0.02,z,w+0.18,0.12,d+0.18,accent,1.4);
    box(b,inner,h*0.52,z,0.055,h*0.86,0.08,accent,1.15);
    const strips=2+((rng()*4)|0);
    for(let i=0;i<strips;i++){
      const wy=1.8+rng()*Math.max(0.2,h-3.5);
      box(b,inner,wy,z+(rng()-0.5)*d*0.65,0.035,0.24+rng()*1.7,0.055+rng()*0.07,win,0.85);
    }
    const bands=1+((rng()*3)|0);
    for(let i=0;i<bands;i++) box(b,x,2.2+rng()*Math.max(0.2,h-4),front,w*(0.28+rng()*0.5),0.06,0.035,win,0.72);
    if(rng()>0.55){
      box(b,x+(rng()-0.5)*w*0.4,h+0.7,z,0.55,1.2,0.55,hexToRgb('#181030'),0.05);
      box(b,x,h+1.35,z,0.06,0.06,0.06,COLORS.red,1.8);
    }
    if(h>19&&rng()>0.55){
      box(b,x,h+2.2,z,0.08,4,0.08,hexToRgb('#211540'),0.02);
      box(b,x,h+4.25,z,0.12,0.12,0.12,COLORS.pink,2.1);
    }
  }
  function addChevron(b,cx,cy,cz,size,col,em){
    const w=size*0.48,h=size*0.6;
    tri(b,[cx-w,cy+h*0.45,cz],[cx,cy-h*0.55,cz],[cx-w*0.2,cy+h*0.45,cz],[0,0,1],col,em);
    tri(b,[cx+w,cy+h*0.45,cz],[cx+w*0.2,cy+h*0.45,cz],[cx,cy-h*0.55,cz],[0,0,1],col,em);
  }

  function addCheckpointGate(b,z,accent){
    const x=CFG.halfWidth+2.35;
    for(const side of [-1,1]){
      box(b,side*x,5.2,z,0.62,10.4,0.7,hexToRgb('#100826'),0.05);
      box(b,side*x,5.2,z+0.38,0.14,10,0.055,accent,2.0);
      box(b,side*x,10.35,z,0.9,0.22,0.9,COLORS.gold,1.8);
      box(b,side*x,1.2,z,0.9,0.2,0.9,COLORS.gold,1.6);
      box(b,side*4.75,5.2,z-4.6,0.08,5.2,0.08,COLORS.gold,1.6);
      box(b,side*4.75,7.8,z-4.6,0.32,0.32,0.32,COLORS.goldBright,2.3);
    }
    box(b,0,10.55,z,x*2+1.4,0.55,0.82,hexToRgb('#120a2c'),0.04);
    box(b,0,10.28,z+0.44,x*2-0.8,0.1,0.06,COLORS.gold,2.1);
    box(b,0,10.85,z,x*2-2.6,0.055,0.055,accent,1.3);
    torus(b,0,5.55,z-0.15,5.35,0.16,44,8,accent,2.2,'z');
    torus(b,0,5.55,z+0.2,6.05,0.07,44,6,COLORS.gold,1.3,'z');
    for(const side of [-1,1]) addChevron(b,side*3.1,12.1,z+0.5,1.35,COLORS.goldBright,2.2);
    for(let i=0;i<15;i++){
      box(b,-CFG.halfWidth+0.5+i*0.82,0.052,z,0.72,0.04,0.76,(i%2===0)?accent:COLORS.white,1.5);
    }
  }
  function buildEnvironment(){
    const b=builder(), rng=mulberry32(0x3f2a91);
    const railStart=CFG.startZ+90, railEnd=CFG.finishZ-30;
    box(b,0,-0.48,(CFG.startZ+CFG.finishZ)/2,CFG.trackWidth+1.2,0.8,CFG.startZ-CFG.finishZ+160,hexToRgb('#05020d'),0);
    for(let z=railStart;z>railEnd;z-=11){
      for(const side of [-1,1]){
        const accent=side<0?COLORS.cyan:COLORS.pink, x=side*(CFG.halfWidth+0.58);
        box(b,x,0.15,z,0.3,0.22,10.5,hexToRgb('#100a24'),0.03);
        box(b,x,0.29,z,0.055,0.045,10.4,accent,1.8);
        box(b,x+side*0.18,0.04,z,0.055,0.045,10.3,accent,0.65);
      }
    }
    for(let z=railStart-22;z>railEnd;z-=58){
      for(const side of [-1,1]){
        const accent=side<0?COLORS.cyan:COLORS.pink,x=side*(CFG.halfWidth+2.8);
        box(b,x,2.5,z,0.18,5,0.18,hexToRgb('#1b1138'),0.06);
        box(b,x-side*0.55,4.92,z,1.15,0.12,0.2,hexToRgb('#221548'),0.04);
        box(b,x-side*1.1,4.78,z,0.08,0.1,0.5,accent,2.2);
        box(b,x-side*1.1,4.78,z,0.16,0.28,0.08,accent,1.0);
        cylinder(b,x,0.12,z,0.46,0.18,8,hexToRgb('#1c1239'),0.03,'y');
      }
    }
    let arch=0;
    for(let z=CFG.startZ-100;z>CFG.finishZ+25;z-=250){
      const accent=arch%2===0?COLORS.cyan:COLORS.pink, x=CFG.halfWidth+1.05;
      for(const side of [-1,1]){
        box(b,side*x,4.5,z,0.28,9,0.28,hexToRgb('#0e0721'),0.03);
        box(b,side*x,4.5,z+0.16,0.06,8.5,0.04,accent,1.2);
        box(b,side*(x-0.45),8.55,z,0.9,0.18,0.3,accent,1.8);
      }
      box(b,0,8.95,z,x*2+0.3,0.42,0.46,hexToRgb('#120a28'),0.03);
      box(b,0,8.72,z+0.03,x*2-1.4,0.045,0.05,accent,1.5);
      box(b,0,9.2,z,x*1.35,0.04,0.04,accent,0.6);
      arch++;
    }
    for(let z=CFG.startZ+40;z>CFG.finishZ-100;z-=48+rng()*26){
      const lvl=cityLevelAtZ(z);
      const density=lvl===2?0.96:(lvl===1?0.9:0.84);
      for(const side of [-1,1]){
        if(rng()>density) continue;
        const x=side*(CFG.halfWidth+9+rng()*34);
        const w=4+rng()*(lvl===2?12:9), d=4+rng()*(lvl===2?12:10);
        const h=(lvl===2?9:(lvl===1?7:6))+Math.pow(rng(),1.65)*(lvl===2?58:(lvl===1?46:37));
        addBuilding(b,x,z+(rng()-0.5)*25,w,h,d,rng);
      }
    }
    for(let i=0;i<38;i++){
      const side=i%2===0?-1:1,z=CFG.startZ-rng()*(CFG.startZ-CFG.finishZ),x=side*(48+rng()*55);
      const lvl=cityLevelAtZ(z),h=(lvl===2?32:(lvl===1?26:20))+rng()*(lvl===2?55:(lvl===1?42:35));
      const accent=lvl===2?(rng()<0.5?COLORS.pink:COLORS.cyan):(rng()<0.5?COLORS.cyan:COLORS.violet);
      box(b,x,h/2-4,z,7+rng()*10,h,7+rng()*10,hexToRgb(CITY_BODY_COLORS[lvl][(rng()*4)|0]),0);
      box(b,x,h+0.2,z,0.15,0.7,0.15,accent,1.75);
    }
    const startZ=CFG.startZ+17;
    for(let i=0;i<16;i++) for(let row=0;row<2;row++){
      box(b,-CFG.halfWidth+0.4+i*0.8,0.045,startZ+(row===0?-0.4:0.4),0.76,0.035,0.76,(i+row)%2===0?COLORS.cyan:COLORS.white,0.6);
    }
    for(let i=0;i<16;i++) for(let row=0;row<2;row++){
      box(b,-CFG.halfWidth+0.4+i*0.8,0.055,CFG.finishZ+(row===0?-0.42:0.42),0.78,0.045,0.8,(i+row)%2===0?COLORS.white:COLORS.pink,1.9);
    }
    const gz=CFG.finishZ;
    for(const side of [-1,1]){
      const x=side*(CFG.halfWidth+2.25);
      box(b,x,6.8,gz,0.75,13.6,0.8,hexToRgb('#100826'),0.04);
      box(b,x,6.8,gz+0.44,0.16,13.1,0.06,COLORS.cyan,2.1);
      box(b,x,10.8,gz,1,0.2,0.95,COLORS.gold,1.9);
      box(b,x,2,gz,1.05,0.22,0.95,COLORS.gold,1.7);
    }
    box(b,0,13.4,gz,CFG.halfWidth*2+5.4,0.7,0.9,hexToRgb('#120a2c'),0.04);
    box(b,0,13.05,gz+0.48,CFG.halfWidth*2+3.4,0.12,0.08,COLORS.gold,2.2);
    box(b,0,13.72,gz,CFG.halfWidth*2+5,0.06,0.06,COLORS.pink,1.4);
    torus(b,0,8.45,gz-0.2,8.2,0.22,48,8,COLORS.cyan,2.4,'z');
    torus(b,0,8.45,gz+0.12,9.05,0.09,48,6,COLORS.pink,1.5,'z');
    for(const side of [-1,1]){
      box(b,side*4.6,3.2,gz-4.2,0.09,6.4,0.09,COLORS.gold,1.8);
      box(b,side*4.6,6.3,gz-4.2,0.36,0.36,0.36,COLORS.goldBright,2.4);
    }
    addCheckpointGate(b,LEVELS[0].finishZ,COLORS.cyan);
    addCheckpointGate(b,LEVELS[1].finishZ,COLORS.pink);
    return upload(b);
  }

  // ---------------------------------------------------------- ciudad dinámica
  const CITY_LEVELS = [
    { gap:[29,44], chance:0.72, farChance:0.18, spread:15, scale:[0.85,1.15] },
    { gap:[20,31], chance:0.90, farChance:0.32, spread:20, scale:[0.95,1.25] },
    { gap:[13,22], chance:1.00, farChance:0.52, spread:24, scale:[1.05,1.35] }
  ];
  const CITY_BODY_COLORS = [
    ['#0a0924','#0d0a2c','#081828','#120b31'],
    ['#0b031e','#160630','#06172e','#1a0638'],
    ['#04010d','#10021f','#03101f','#1d0226']
  ];
  function cityLevelAtZ(z){
    if(z>LEVELS[1].startZ) return 0;
    if(z>LEVELS[2].startZ) return 1;
    return 2;
  }

  function buildCityTower(level,variant){
    const b=builder(), rng=mulberry32((0x51f15e+level*7919+variant*131)>>>0);
    const w=level===0?4.6+rng()*3.8:(level===1?5.8+rng()*4.6:6.8+rng()*5.4);
    const d=level===0?4.8+rng()*4.0:(level===1?6.0+rng()*4.8:7.0+rng()*5.6);
    const h=level===0?10+rng()*15:(level===1?18+rng()*25:30+rng()*40);
    const body=hexToRgb(CITY_BODY_COLORS[level][(rng()*4)|0]);
    const lights=level===0?[COLORS.cyan,COLORS.pink,COLORS.violet]:level===1?[COLORS.cyan,COLORS.pink,COLORS.violet,COLORS.gold]:[COLORS.pink,COLORS.cyan,COLORS.red,COLORS.violet,COLORS.gold];
    const accent=lights[(rng()*lights.length)|0];
    const window=lights[(rng()*lights.length)|0];
    const signColor=lights[(rng()*lights.length)|0];
    const tiers=variant===4?3:(variant===2?2:1);
    const tierH=h/tiers;
    let y=0, tw=w, td=d;
    for(let t=0;t<tiers;t++){
      box(b,0,y+tierH/2,0,tw,tierH,td,body,0.02);
      box(b,0,y+tierH+0.07,0,tw+0.25,0.14,td+0.25,accent,1.35);
      for(const side of [-1,1]){
        box(b,side*(tw/2+0.025),y+tierH/2,0,0.055,tierH*0.82,0.085,accent,1.05);
        const strips=level===2?3:2;
        for(let i=0;i<strips;i++){
          const wy=y+tierH*(0.18+rng()*0.66);
          box(b,side*(tw/2+0.04),wy,(rng()-0.5)*td*0.55,0.03,0.18+rng()*Math.min(1.7,tierH*0.4),0.06+rng()*0.06,window,0.8);
        }
      }
      const bands=level===0?2+((rng()*2)|0):3+((rng()*3)|0);
      for(let i=0;i<bands;i++){
        box(b,0,y+tierH*(0.16+rng()*0.7),td/2+0.045,tw*(0.32+rng()*0.46),0.055,0.035,window,0.85);
      }
      y+=tierH; tw*=0.79; td*=0.79;
    }
    const topW=w*Math.pow(0.79,tiers-1), topD=d*Math.pow(0.79,tiers-1);
    box(b,0,h+0.18,0,topW*0.34,0.24,topD*0.34,hexToRgb('#120a28'),0.02);
    if(h>24){
      box(b,0,h+2.3,0,0.08,4.1,0.08,hexToRgb('#1b1138'),0.02);
      box(b,0,h+4.35,0,0.16,0.16,0.16,accent,2.2);
    }
    const signW=Math.min(w*0.7,7.4), signH=Math.min(2.4,h*0.16);
    const sy=Math.min(h*0.56,tierH*0.62), front=d/2+0.1;
    box(b,0,sy,front,signW,signH,0.1,hexToRgb('#06010d'),0.03);
    box(b,0,sy+signH/2+0.03,front+0.06,signW,0.06,0.05,signColor,1.8);
    box(b,0,sy-signH/2-0.03,front+0.06,signW,0.06,0.05,signColor,1.8);
    box(b,-signW/2-0.03,sy,front+0.06,0.06,signH,0.05,signColor,1.8);
    box(b,signW/2+0.03,sy,front+0.06,0.06,signH,0.05,signColor,1.8);
    const bars=level===2?4:3;
    for(let i=0;i<bars;i++){
      const bw=signW*(0.16+rng()*0.52);
      box(b,(rng()-0.5)*signW*0.22,sy-signH*0.28+signH*0.2*i,front+0.075,bw,0.07,0.03,window,1.25);
    }
    if(level===2){
      for(let i=0;i<3;i++) addChevron(b,(i-1)*signW*0.28,sy,front+0.12,signH*0.4,COLORS.goldBright,1.4);
      if(variant%2===0) torus(b,0,h+1.1,0,Math.max(1.3,topW*0.32),0.06,26,5,accent,2.1,'y');
    }
    return {mesh:upload(b),w,d,h,tiers};
  }

  function buildCityMeshes(){
    const levels=[[],[],[]];
    for(let l=0;l<3;l++) for(let v=0;v<6;v++) levels[l].push(buildCityTower(l,v));
    return levels;
  }

  const city={objects:[],builtToZ:0,rng:null};
  let cityDrawn=0;
  function resetCity(){
    city.objects.length=0;
    city.builtToZ=CFG.startZ+32;
    city.rng=mulberry32((Date.now()^(Math.random()*0xffffffff))>>>0);
    ensureCity();
  }
  function ensureCity(){
    if(!city.rng) return;
    const frontier=player.z-300;
    let guard=0;
    while(city.builtToZ>frontier&&guard++<140){
      const rowZ=city.builtToZ;
      const level=cityLevelAtZ(rowZ);
      const cfg=CITY_LEVELS[level];
      const sides=[];
      for(const side of [-1,1]) if(city.rng()<cfg.chance) sides.push(side);
      if(!sides.length&&city.rng()<0.55) sides.push(city.rng()<0.5?-1:1);
      for(const side of sides){
        const variant=(city.rng()*6)|0;
        const base=cityMeshes[level][variant];
        const scale=cfg.scale[0]+city.rng()*(cfg.scale[1]-cfg.scale[0]);
        const far=city.rng()<cfg.farChance;
        const x=side*((far?CFG.halfWidth+34+city.rng()*30:CFG.halfWidth+6.2+city.rng()*cfg.spread)+base.w*scale/2);
        city.objects.push({x,z:rowZ+(city.rng()-0.5)*5,level,scale,mesh:base.mesh,glow:1+level*0.1});
      }
      city.builtToZ-=cfg.gap[0]+city.rng()*(cfg.gap[1]-cfg.gap[0]);
    }
    city.objects=city.objects.filter(o=>o.z<player.z+90);
  }
  function drawCity(){
    const m=M4.create();
    cityDrawn=0;
    for(const o of city.objects){
      if(o.z>player.z+42||o.z<player.z-260) continue;
      M4.compose(m,o.x,0,o.z,0,0,0,o.scale,o.scale,o.scale);
      drawMesh(o.mesh,m,o.glow,1);
      cityDrawn++;
    }
  }

  // ---------------------------------------------------------- objetos
  function buildCoin(){
    const b=builder();
    cylinder(b,0,0,0,0.37,0.075,20,COLORS.gold,0.75,'z');
    torus(b,0,0,0,0.38,0.075,22,7,COLORS.goldBright,1.65,'z');
    cylinder(b,0,0,0.005,0.245,0.095,16,COLORS.goldBright,1.35,'z');
    box(b,0,0.11,0.055,0.055,0.28,0.025,COLORS.gold,1.9);
    box(b,0,0.11,0.055,0.22,0.052,0.025,COLORS.gold,1.9);
    sphere(b,0,0.19,0.056,0.05,8,6,COLORS.goldBright,2);
    return upload(b);
  }

  function buildMagnet(){
    const b=builder(), segs=18, major=0.34, minor=0.105, cy=0.12;
    for(let i=0;i<segs;i++){
      const a0=Math.PI*(i/segs),a1=Math.PI*((i+1)/segs);
      const cu0=Math.cos(a0),su0=Math.sin(a0),cu1=Math.cos(a1),su1=Math.sin(a1);
      for(let j=0;j<6;j++){
        const v0=j/6*Math.PI*2,v1=(j+1)/6*Math.PI*2;
        const cv0=Math.cos(v0),sv0=Math.sin(v0),cv1=Math.cos(v1),sv1=Math.sin(v1);
        const r0=major+minor*cv0,r1=major+minor*cv1;
        const p0=[r0*cu0,cy+r0*su0,minor*sv0],p1=[r0*cu1,cy+r0*su1,minor*sv0];
        const p2=[r1*cu1,cy+r1*su1,minor*sv1],p3=[r1*cu0,cy+r1*su0,minor*sv1];
        tri(b,p0,p1,p2,[cv0*cu0,cv0*su0,sv0],COLORS.cyan,1.85);
        tri(b,p0,p2,p3,[cv1*cu0,cv1*su0,sv1],COLORS.cyan,1.85);
      }
    }
    for(const side of [-1,1]){
      box(b,side*major,-0.28,0,0.21,0.84,0.21,COLORS.cyanDeep,0.85);
      box(b,side*major,-0.3,0.072,0.055,0.66,0.04,COLORS.cyan,2.1);
      box(b,side*major,-0.74,0,0.24,0.24,0.24,COLORS.pink,2.2);
    }
    torus(b,0,-0.02,0,0.62,0.025,28,5,COLORS.cyan,1.2,'z');
    return upload(b);
  }

  function buildHighBarrier(){
    const b=builder(), dark=hexToRgb('#12081c'), metal=hexToRgb('#241231');
    for(const side of [-1,1]){
      box(b,side*1.06,0.12,0,0.66,0.24,0.86,dark,0.04);
      box(b,side*1.06,1.65,0,0.22,3.3,0.28,metal,0.08);
      box(b,side*1.06,1.7,0.155,0.07,2.95,0.045,COLORS.pink,2.2);
      box(b,side*1.06,3.3,0,0.34,0.22,0.38,dark,0.04);
      box(b,side*1.06,3.32,0.19,0.16,0.12,0.07,COLORS.red,2.4);
    }
    box(b,0,1.62,0,1.92,3.08,0.07,hexToRgb('#2a0824'),0.36);
    box(b,0,1.62,0.062,1.78,2.9,0.025,hexToRgb('#5b0a39'),0.85);
    box(b,0,3.13,0,2.26,0.17,0.34,COLORS.red,2.15);
    box(b,0,0.18,0,2.26,0.12,0.34,COLORS.gold,1.5);
    for(let y=0.55;y<=2.75;y+=0.44) box(b,0,y,0.085,1.78,0.035,0.03,COLORS.pink,1.55);
    for(let i=-1;i<=1;i++) box(b,i*0.55,1.62,0.115,0.035,2.75,0.03,COLORS.red,1.2);
    return upload(b);
  }
  function buildBarrier(){
    const b=builder(), dark=hexToRgb('#15091d'), metal=hexToRgb('#21162c');
    for(const side of [-1,1]){
      box(b,side*1.06,0.1,0,0.7,0.2,0.82,dark,0.04);
      box(b,side*1.06,0.7,0,0.16,1.25,0.24,metal,0.08);
      box(b,side*1.06,0.72,0.14,0.055,1.1,0.04,COLORS.red,2);
      box(b,side*1.06,1.36,0,0.26,0.18,0.32,dark,0.04);
      box(b,side*1.06,1.38,0.17,0.12,0.1,0.06,COLORS.gold,2.2);
    }
    box(b,0,0.72,0,2.16,0.36,0.24,hexToRgb('#250c1a'),0.22);
    box(b,0,0.92,0.14,2.02,0.13,0.055,COLORS.red,2.15);
    box(b,0,0.52,0.14,2.02,0.065,0.055,COLORS.pink,1.6);
    box(b,0,1.33,0,2.2,0.07,0.32,COLORS.red,1.2);
    for(let i=-1;i<=1;i++) addChevron(b,i*0.68,0.76,0.178,0.35,COLORS.goldBright,2.4);
    box(b,0,0.02,0,2.42,0.04,0.72,COLORS.red,0.9);
    return upload(b);
  }

  function buildPlayer(){
    const suit=hexToRgb('#2f5aa8'),dark=hexToRgb('#1b3468'),skin=hexToRgb('#e8b499'),hair=hexToRgb('#9b3fd0');
    const trim=COLORS.cyan,accent=COLORS.pink;
    let b=builder();
    box(b,0,0,0,0.52,0.68,0.3,suit,0.62);
    box(b,0,0.33,0,0.6,0.12,0.34,dark,0.62);
    box(b,-0.3,0.24,0,0.2,0.18,0.36,dark,0.62);
    box(b,0.3,0.24,0,0.2,0.18,0.36,dark,0.62);
    box(b,0,0.11,-0.166,0.34,0.13,0.045,trim,1.45);
    box(b,-0.215,0,-0.168,0.032,0.42,0.04,trim,1.2);
    box(b,0.215,0,-0.168,0.032,0.42,0.04,accent,1.3);
    box(b,0,-0.11,-0.166,0.27,0.035,0.04,accent,1.1);
    sphere(b,0,0.045,-0.2,0.082,10,7,accent,2.4);
    box(b,0,-0.02,0.19,0.3,0.36,0.13,dark,0.62);
    box(b,0,0.04,0.263,0.16,0.03,0.035,trim,1.5);
    box(b,0,0.33,0.2,0.44,0.06,0.04,trim,1.1);
    const torso=upload(b);

    b=builder();
    cylinder(b,0,-0.28,0,0.09,0.16,8,skin,0);
    sphere(b,0,0,0,0.225,16,12,skin,0.02);
    sphere(b,0,0.06,0.04,0.238,16,10,hair,0.18);
    box(b,0,0.07,0.1,0.42,0.18,0.28,hair,0.22);
    cylinder(b,0.16,0.16,0.17,0.075,0.34,8,hair,0.22,'z');
    cylinder(b,-0.22,0.01,0.01,0.075,0.06,10,COLORS.gold,1.3,'x');
    cylinder(b,0.22,0.01,0.01,0.075,0.06,10,COLORS.gold,1.3,'x');
    box(b,0,0.04,-0.205,0.34,0.09,0.06,trim,2.2);
    box(b,0,0.04,-0.24,0.29,0.045,0.025,COLORS.white,1.3);
    box(b,0,0.26,0,0.08,0.08,0.28,trim,1.8);
    const head=upload(b);

    b=builder();
    box(b,0,0,0,0.42,0.2,0.27,dark,0.62);
    box(b,0,-0.05,-0.145,0.3,0.055,0.035,accent,1.4);
    box(b,0,0.08,0.14,0.26,0.04,0.03,trim,1.1);
    const pelvis=upload(b);

    b=builder();
    sphere(b,0,0,0,0.12,10,8,dark,0.62);
    box(b,0,-0.18,0,0.145,0.36,0.16,suit,0.62);
    box(b,0.077,-0.18,-0.02,0.025,0.28,0.06,trim,1.3);
    box(b,0,-0.36,0,0.13,0.05,0.15,accent,1.2);
    const upperArm=upload(b);

    b=builder();
    box(b,0,-0.16,0,0.125,0.32,0.15,suit,0.62);
    box(b,0,-0.17,-0.085,0.09,0.17,0.03,trim,1.05);
    box(b,0,-0.35,0.01,0.13,0.13,0.17,dark,0.62);
    box(b,0,-0.39,-0.075,0.085,0.035,0.04,accent,1.4);
    const forearm=upload(b);

    b=builder();
    sphere(b,0,0,0,0.115,10,8,dark,0.62);
    box(b,0,-0.2,0,0.185,0.4,0.21,suit,0.62);
    box(b,0.096,-0.2,-0.01,0.026,0.32,0.07,trim,1.25);
    box(b,0,-0.41,0,0.17,0.055,0.19,accent,1.15);
    const upperLeg=upload(b);

    b=builder();
    box(b,0,-0.18,0,0.16,0.36,0.18,suit,0.62);
    box(b,0,-0.17,-0.096,0.06,0.24,0.03,trim,1.3);
    box(b,0,-0.36,-0.015,0.18,0.12,0.28,dark,0.62);
    box(b,0,-0.39,0.02,0.19,0.04,0.31,accent,1.35);
    box(b,0,-0.43,-0.105,0.14,0.035,0.055,trim,1.6);
    const lowerLeg=upload(b);

    return {torso,head,pelvis,upperArm,forearm,upperLeg,lowerLeg};
  }

  function buildShadow(){
    const b=builder(),segments=28,radius=0.78;
    for(let i=0;i<segments;i++){
      const a0=i/segments*Math.PI*2,a1=(i+1)/segments*Math.PI*2;
      tri(b,[0,0,0],[Math.cos(a0)*radius,0,Math.sin(a0)*radius],[Math.cos(a1)*radius,0,Math.sin(a1)*radius],[0,1,0],[0.01,0,0.02],0);
    }
    return upload(b);
  }

  const meshes={environment:buildEnvironment(),coin:buildCoin(),magnet:buildMagnet(),barrier:buildBarrier(),highBarrier:buildHighBarrier(),player:buildPlayer(),shadow:buildShadow()};
  const cityMeshes=buildCityMeshes();

  const trackMesh={count:6,buffer:gl.createBuffer()};
  (function(){
    const z0=CFG.startZ+90,z1=CFG.finishZ-20,hw=CFG.halfWidth+0.05;
    const verts=new Float32Array([-hw,0,z0,hw,0,z0,hw,0,z1,-hw,0,z0,hw,0,z1,-hw,0,z1]);
    gl.bindBuffer(gl.ARRAY_BUFFER,trackMesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);
  })();

  // ---------------------------------------------------------- post-proceso
  let renderWidth=1, renderHeight=1, bloomWidth=1, bloomHeight=1, pixelRatio=1;
  let postEnabled=true, sceneFBO=null, sceneTex=null, sceneDepth=null;
  let bloomFBOA=null, bloomFBOB=null, bloomTexA=null, bloomTexB=null;

  function makeTexture(w,h){
    const t=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    return t;
  }
  function destroyTargets(){
    if(sceneFBO) gl.deleteFramebuffer(sceneFBO);
    if(bloomFBOA) gl.deleteFramebuffer(bloomFBOA);
    if(bloomFBOB) gl.deleteFramebuffer(bloomFBOB);
    if(sceneTex) gl.deleteTexture(sceneTex);
    if(bloomTexA) gl.deleteTexture(bloomTexA);
    if(bloomTexB) gl.deleteTexture(bloomTexB);
    if(sceneDepth) gl.deleteRenderbuffer(sceneDepth);
    sceneFBO=bloomFBOA=bloomFBOB=sceneTex=bloomTexA=bloomTexB=sceneDepth=null;
  }
  function createTargets(){
    destroyTargets(); postEnabled=true;
    try{
      bloomWidth=Math.max(1,Math.floor(renderWidth/2)); bloomHeight=Math.max(1,Math.floor(renderHeight/2));
      sceneTex=makeTexture(renderWidth,renderHeight);
      sceneFBO=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,sceneFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,sceneTex,0);
      sceneDepth=gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER,sceneDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,renderWidth,renderHeight);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,sceneDepth);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('scene fbo');
      bloomTexA=makeTexture(bloomWidth,bloomHeight); bloomFBOA=gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,bloomFBOA);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,bloomTexA,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('bloom a');
      bloomTexB=makeTexture(bloomWidth,bloomHeight); bloomFBOB=gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER,bloomFBOB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,bloomTexB,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('bloom b');
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }catch(err){
      console.warn('Bloom desactivado:',err);
      postEnabled=false; destroyTargets(); gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
  }
  function resize(){
    const w=Math.max(320,window.innerWidth), h=Math.max(240,window.innerHeight);
    let dpr=Math.min(window.devicePixelRatio||1,1.6);
    if(w*h*dpr*dpr>2400000) dpr=Math.sqrt(2400000/(w*h));
    pixelRatio=dpr; renderWidth=Math.max(320,Math.floor(w*dpr)); renderHeight=Math.max(240,Math.floor(h*dpr));
    canvas.width=renderWidth; canvas.height=renderHeight;
    canvas.style.width=w+'px'; canvas.style.height=h+'px';
    createTargets(); gl.viewport(0,0,renderWidth,renderHeight);
  }

  // ---------------------------------------------------------- partículas
  const MAX_PARTICLES=900;
  const particles=[];
  const pPos=new Float32Array(MAX_PARTICLES*3), pCol=new Float32Array(MAX_PARTICLES*3),
        pSize=new Float32Array(MAX_PARTICLES), pAlpha=new Float32Array(MAX_PARTICLES);
  const pBuf={position:gl.createBuffer(),color:gl.createBuffer(),size:gl.createBuffer(),alpha:gl.createBuffer()};

  function spawnParticles(x,y,z,count,color,speed,life,size,gravity){
    gravity=gravity===undefined?-7:gravity;
    for(let i=0;i<count;i++){
      if(particles.length>=MAX_PARTICLES) particles.shift();
      const theta=Math.random()*Math.PI*2, phi=Math.random()*Math.PI, s=speed*(0.35+Math.random()*0.85);
      particles.push({x,y,z,vx:Math.sin(phi)*Math.cos(theta)*s,vy:Math.cos(phi)*s*0.8+speed*0.25,
        vz:Math.sin(phi)*Math.sin(theta)*s,life:life*(0.6+Math.random()*0.7),maxLife:life,
        size:size*(0.65+Math.random()*0.75),color,gravity});
    }
  }
  function coinBurst(x,y,z){spawnParticles(x,y,z,15,COLORS.goldBright,3.2,0.75,0.19,-3.5);spawnParticles(x,y,z,6,COLORS.white,1.7,0.4,0.11,-2);}
  function hitBurst(x,y,z){spawnParticles(x,y,z,28,COLORS.red,5.2,0.85,0.22,-8);spawnParticles(x,y,z,12,COLORS.gold,3,0.7,0.15,-6);}
  function jumpBurst(x,y,z){spawnParticles(x,y,z,10,COLORS.cyan,2.1,0.52,0.13,-2.6);}
  function finishBurst(z){
    z=z===undefined?CFG.finishZ:z;
    for(let i=0;i<140;i++){
      if(particles.length>=MAX_PARTICLES) particles.shift();
      const a=Math.random()*Math.PI*2,r=2+Math.random()*8;
      particles.push({x:Math.cos(a)*r,y:1.5+Math.random()*8,z:z-2+Math.sin(a)*4,
        vx:Math.cos(a)*(2+Math.random()*5),vy:2+Math.random()*7,vz:Math.sin(a)*(2+Math.random()*5),
        life:1.8+Math.random()*1.4,maxLife:3.2,size:0.1+Math.random()*0.22,
        color:[COLORS.gold,COLORS.cyan,COLORS.pink,COLORS.white][(Math.random()*4)|0],gravity:-5.5});
    }
  }
  function updateParticles(dt){
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i]; p.life-=dt;
      if(p.life<=0){particles.splice(i,1);continue;}
      p.vy+=p.gravity*dt; p.vx*=1-0.9*dt; p.vz*=1-0.9*dt;
      p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
      if(p.y<0.03){p.y=0.03;p.vy*=-0.28;p.vx*=0.76;p.vz*=0.76;}
    }
  }
  function uploadParticles(){
    let n=0;
    for(let i=0;i<particles.length&&n<MAX_PARTICLES;i++){
      const p=particles[i], alpha=clamp(p.life/Math.min(p.maxLife,0.9),0,1);
      pPos[n*3]=p.x;pPos[n*3+1]=p.y;pPos[n*3+2]=p.z;
      pCol[n*3]=p.color[0];pCol[n*3+1]=p.color[1];pCol[n*3+2]=p.color[2];
      pSize[n]=p.size;pAlpha[n]=alpha;n++;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,pBuf.position);gl.bufferData(gl.ARRAY_BUFFER,pPos.subarray(0,n*3),gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,pBuf.color);gl.bufferData(gl.ARRAY_BUFFER,pCol.subarray(0,n*3),gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,pBuf.size);gl.bufferData(gl.ARRAY_BUFFER,pSize.subarray(0,n),gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,pBuf.alpha);gl.bufferData(gl.ARRAY_BUFFER,pAlpha.subarray(0,n),gl.DYNAMIC_DRAW);
    return n;
  }

  // ---------------------------------------------------------- estado
  let state='LOADING';
  let time=0, menuTime=0, lastFrame=0;
  let coins=[], obstacles=[], powerups=[], totalCoins=0;
  let countdownTimer=0, countdownStep=4, dyingTimer=0, finishTimer=0;
  let toastTimer=0;
  let bestScore=0, bestCoins=0;
  let player={
    x:0,z:CFG.startZ,y:0,vy:0,lane:1,speed:0,runPhase:0,grounded:true,
    invulnerable:0,magnet:0,hitPenalty:0,lean:0,roll:0,landSquash:0
  };
  let run={lives:CFG.maxLives,coins:0,score:0,distance:0,combo:0,comboTimer:0,elapsed:0};
  const camera={fov:60,shake:0,pos:[0,4.3,18],look:[0,1.4,-12]};
  const input={left:false,right:false,boost:false,brake:false,jump:false};
  let soundEnabled=true, audio=null;

  try {
    bestScore=parseInt(localStorage.getItem('neonRunBestScore')||'0',10)||0;
    bestCoins=parseInt(localStorage.getItem('neonRunBestCoins')||'0',10)||0;
  } catch(e) { bestScore=0; bestCoins=0; }

  // ---------------------------------------------------------- render 3D
  const projection=M4.create(), view=M4.create(), identity=M4.create();
  const cameraPos=[0,4.3,18], cameraLook=[0,1.4,-12];

  function fullscreen(program,loc){
    gl.bindBuffer(gl.ARRAY_BUFFER,fsQuad); gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0); gl.drawArrays(gl.TRIANGLES,0,3);
  }
  function bindMesh(mesh){
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffers.position);gl.enableVertexAttribArray(U.mesh.position);gl.vertexAttribPointer(U.mesh.position,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffers.normal);gl.enableVertexAttribArray(U.mesh.normal);gl.vertexAttribPointer(U.mesh.normal,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffers.color);gl.enableVertexAttribArray(U.mesh.color);gl.vertexAttribPointer(U.mesh.color,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffers.emissive);gl.enableVertexAttribArray(U.mesh.emissive);gl.vertexAttribPointer(U.mesh.emissive,1,gl.FLOAT,false,0,0);
  }
  function drawMesh(mesh,model,glow,alpha){
    gl.uniformMatrix4fv(U.mesh.model,false,model);
    gl.uniform1f(U.mesh.glow,glow===undefined?1:glow);
    gl.uniform1f(U.mesh.alpha,alpha===undefined?1:alpha);
    bindMesh(mesh); gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  function drawSky(){
    gl.useProgram(skyProgram);
    gl.uniform1f(U.sky.time,time);gl.uniform1f(U.sky.aspect,renderWidth/renderHeight);
    gl.uniform2f(U.sky.parallax,cameraPos[0],cameraPos[2]);
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.disable(gl.BLEND);
    fullscreen(skyProgram,U.sky.position);
    gl.enable(gl.DEPTH_TEST);gl.depthMask(true);
  }
  function drawTrack(){
    gl.useProgram(trackProgram);
    gl.uniformMatrix4fv(U.track.projection,false,projection);gl.uniformMatrix4fv(U.track.view,false,view);
    gl.uniform1f(U.track.time,time);gl.uniform1f(U.track.speed,player.speed);gl.uniform1f(U.track.finish,currentLevel().finishZ);
    gl.uniform3fv(U.track.fogColor,FOG_COLOR);gl.uniform1f(U.track.fogNear,CFG.fogNear);gl.uniform1f(U.track.fogFar,CFG.fogFar);
    gl.bindBuffer(gl.ARRAY_BUFFER,trackMesh.buffer);gl.enableVertexAttribArray(U.track.position);
    gl.vertexAttribPointer(U.track.position,3,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,trackMesh.count);
  }
  function prepareMesh(){
    gl.useProgram(meshProgram);
    gl.uniformMatrix4fv(U.mesh.projection,false,projection);gl.uniformMatrix4fv(U.mesh.view,false,view);
    gl.uniform3fv(U.mesh.fogColor,FOG_COLOR);gl.uniform1f(U.mesh.fogNear,CFG.fogNear);gl.uniform1f(U.mesh.fogFar,CFG.fogFar);
    gl.uniform3fv(U.mesh.cameraPos,cameraPos);
  }
  function drawParticles(){
    if(!particles.length) return;
    const n=uploadParticles(); if(!n) return;
    gl.useProgram(partProgram);
    gl.uniformMatrix4fv(U.part.projection,false,projection);gl.uniformMatrix4fv(U.part.view,false,view);gl.uniform1f(U.part.pixelRatio,pixelRatio);
    gl.bindBuffer(gl.ARRAY_BUFFER,pBuf.position);gl.enableVertexAttribArray(U.part.position);gl.vertexAttribPointer(U.part.position,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,pBuf.color);gl.enableVertexAttribArray(U.part.color);gl.vertexAttribPointer(U.part.color,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,pBuf.size);gl.enableVertexAttribArray(U.part.size);gl.vertexAttribPointer(U.part.size,1,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,pBuf.alpha);gl.enableVertexAttribArray(U.part.alpha);gl.vertexAttribPointer(U.part.alpha,1,gl.FLOAT,false,0,0);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
    gl.drawArrays(gl.POINTS,0,n);
    gl.depthMask(true);gl.disable(gl.BLEND);
  }

  function updateCamera(dt){
    const speedNorm=clamp((player.speed-CFG.brakeSpeed)/(CFG.boostSpeed-CFG.brakeSpeed),0,1);
    let tx,ty,tz,lx,ly,lz,fov;
    if(state==='MENU'||state==='LOADING'){
      // En el menú la cámara se sitúa detrás y algo elevada, mirando al runner
      // de frente hacia la meta, para que se vea claro nada más abrir el juego.
      const sway=Math.sin(menuTime*0.32)*0.5;
      tx=player.x*0.34+sway; ty=2.9+Math.sin(menuTime*0.27)*0.08; tz=player.z+6.4;
      lx=player.x*0.55; ly=1.9; lz=player.z-20.0; fov=55;
    } else if(state==='VICTORY'||state==='FINISHING'||state==='LEVEL_COMPLETE'){
      const t=time*0.35;
      tx=Math.sin(t)*7.5; ty=4+Math.sin(t*0.6)*0.8; tz=player.z+Math.cos(t)*7.5+2;
      lx=0; ly=2.1; lz=player.z-8; fov=58;
    } else {
      // Cámara en 3ª persona: detrás y elevada, mirando al runner y a la pista
      // hacia la meta. Así el personaje queda centrado y bien visible.
      const sway=Math.sin(menuTime*0.32)*0.5;
      tx=player.x*0.34+sway; ty=3.0+player.y*0.30+Math.sin(time*1.4)*0.02;
      tz=player.z+6.6+speedNorm*0.8; lx=player.x*0.55; ly=player.y*0.34+1.95;
      lz=player.z-20.0-speedNorm*2.0; fov=56+speedNorm*7;
    }
    const smooth=state==='MENU'?3.5:6.5;
    cameraPos[0]=damp(cameraPos[0],tx,smooth,dt); cameraPos[1]=damp(cameraPos[1],ty,smooth,dt); cameraPos[2]=damp(cameraPos[2],tz,smooth,dt);
    cameraLook[0]=damp(cameraLook[0],lx,smooth,dt); cameraLook[1]=damp(cameraLook[1],ly,smooth,dt); cameraLook[2]=damp(cameraLook[2],lz,smooth,dt);
    if(camera.shake>0.001){
      const s=camera.shake;
      cameraPos[0]+=(Math.random()-0.5)*s*0.5;cameraPos[1]+=(Math.random()-0.5)*s*0.34;cameraPos[2]+=(Math.random()-0.5)*s*0.22;
      camera.shake=damp(camera.shake,0,7.5,dt);
    }
    camera.fov=damp(camera.fov,fov,4,dt);
    camera.pos[0]=cameraPos[0];camera.pos[1]=cameraPos[1];camera.pos[2]=cameraPos[2];
    camera.look[0]=cameraLook[0];camera.look[1]=cameraLook[1];camera.look[2]=cameraLook[2];
    M4.perspective(projection,camera.fov*Math.PI/180,renderWidth/renderHeight,0.1,250);
    M4.lookAt(view,cameraPos,cameraLook,[0,1,0]);
  }

  function drawWorldObjects(){
    const m=M4.create();
    for(const c of coins){
      if(c.collected || c.z>player.z+10 || c.z<player.z-220) continue;
      const y=c.y+Math.sin(time*3+c.phase)*0.16;
      M4.compose(m,c.x,y,c.z,0,time*3.2+c.phase,0,0.9,0.9,0.9);
      drawMesh(meshes.coin,m,1.25,1);
    }
    for(const p of powerups){
      if(!p.active || p.z>player.z+10 || p.z<player.z-220) continue;
      const y=p.y+Math.sin(time*2.4+p.phase)*0.2;
      M4.compose(m,p.x,y,p.z,0,Math.sin(time*1.3+p.phase)*0.8,0,0.9,0.9,0.9);
      drawMesh(meshes.magnet,m,1.6,1);
    }
    for(const o of obstacles){
      if(o.hit || o.z>player.z+12 || o.z<player.z-220) continue;
      const pulse=1+Math.sin(time*(o.high?7:5)+o.z*0.05)*(o.high?0.12:0.08);
      M4.compose(m,o.x,0,o.z,0,0,0,o.width/2.4,1,1);
      drawMesh(o.high?meshes.highBarrier:meshes.barrier,m,pulse,1);
    }
  }

  function drawPlayer(){
    const speedNorm=clamp(player.speed/CFG.boostSpeed,0,1);
    const jumping=player.grounded?0:1;
    const phase=player.runPhase;
    const swing=Math.sin(phase)*(0.55+speedNorm*0.28)*(0.4+Math.min(1,player.speed/8)*0.6);
    const bob=Math.sin(phase*2)*(0.018+speedNorm*0.014);
    const jumpTilt=jumping*(player.vy>0?-0.16:0.12);

    const mShadow=M4.create(),root=M4.create(),local=M4.create();
    M4.compose(mShadow,player.x,0.025,player.z,0,0,0,1,1,1);
    gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
    drawMesh(meshes.shadow,mShadow,1,0.42);
    gl.depthMask(true);gl.disable(gl.BLEND);

    if(player.invulnerable>0 && Math.floor(time*18)%2===0) return;

    M4.compose(root,player.x,player.y-0.1+bob,player.z,-(0.05+speedNorm*0.1)+jumpTilt,0,player.roll,1,1,1);

    // Halo suave detrás del runner: hace que su silueta se lea con claridad
    // contra la pista, incluso cuando va de espaldas a la luz principal.
    {
      const halo=M4.create();
      const hp=0.85+Math.sin(time*3.2)*0.06;
      M4.compose(halo,player.x,player.y+0.95,player.z,0,0,0,2.0*hp,2.5*hp,1.0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE); gl.depthMask(false);
      drawMesh(meshes.shadow,halo,1,0.30);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }

    const hipY=0.91, shoulderY=1.45, torsoY=1.2;
    const hipL=swing-jumping*0.75, hipR=-swing-jumping*0.75;
    const kneeL=Math.max(0,-Math.sin(phase))*0.95+jumping*1.05;
    const kneeR=Math.max(0,Math.sin(phase))*0.95+jumping*1.05;
    const armL=-swing*0.78-jumping*1.05, armR=swing*0.78-jumping*1.05;
    const elbow=-0.42-jumping*0.45;

    function partModel(px,py,pz,rx,ry,rz,out){
      M4.compose(local,px,py,pz,rx,ry,rz,1,1,1);
      return M4.multiply(out,root,local);
    }

    // Piernas
    const legL=M4.create(),legR=M4.create(),lowerL=M4.create(),lowerR=M4.create();
    partModel(-0.14,hipY,0,hipL,0,0.02,legL);
    partModel(0.14,hipY,0,hipR,0,-0.02,legR);
    drawMesh(meshes.player.upperLeg,legL,1,1);
    drawMesh(meshes.player.upperLeg,legR,1,1);
    M4.compose(local,0,-0.4,0,kneeL,0,0,1,1,1); M4.multiply(lowerL,legL,local);
    M4.compose(local,0,-0.4,0,kneeR,0,0,1,1,1); M4.multiply(lowerR,legR,local);
    drawMesh(meshes.player.lowerLeg,lowerL,1,1);
    drawMesh(meshes.player.lowerLeg,lowerR,1,1);

    // Pelvis y torso
    const pelvis=M4.create();
    partModel(0,0.98,0,0,0,0,pelvis);
    drawMesh(meshes.player.pelvis,pelvis,1,1);
    const torso=M4.create();
    partModel(0,torsoY,0,0,0,Math.sin(phase)*0.025,torso);
    drawMesh(meshes.player.torso,torso,1,1);

    // Brazos
    const armLM=M4.create(),armRM=M4.create(),foreL=M4.create(),foreR=M4.create();
    partModel(-0.34,shoulderY,0,armL,0,-0.12,armLM);
    partModel(0.34,shoulderY,0,armR,0,0.12,armRM);
    drawMesh(meshes.player.upperArm,armLM,1,1);
    drawMesh(meshes.player.upperArm,armRM,1,1);
    M4.compose(local,0,-0.36,0,elbow,0,0,1,1,1); M4.multiply(foreL,armLM,local);
    M4.compose(local,0,-0.36,0,elbow,0,0,1,1,1); M4.multiply(foreR,armRM,local);
    drawMesh(meshes.player.forearm,foreL,1,1);
    drawMesh(meshes.player.forearm,foreR,1,1);

    // Cabeza
    const head=M4.create();
    partModel(0,1.72,0,Math.sin(phase*2)*0.018,0,-Math.sin(phase)*0.03,head);
    drawMesh(meshes.player.head,head,1,1);
  }

  function renderScene(){
    gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.clearColor(FOG_COLOR[0],FOG_COLOR[1],FOG_COLOR[2],1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    drawSky(); drawTrack(); prepareMesh();
    drawMesh(meshes.environment,identity,1,1);
    drawCity(); drawWorldObjects(); drawPlayer();
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);drawParticles();gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
  }

  function render(){
    gl.bindFramebuffer(gl.FRAMEBUFFER,postEnabled?sceneFBO:null);
    gl.viewport(0,0,renderWidth,renderHeight); renderScene();
    if(!postEnabled){gl.bindFramebuffer(gl.FRAMEBUFFER,null);return;}

    gl.bindFramebuffer(gl.FRAMEBUFFER,bloomFBOA);gl.viewport(0,0,bloomWidth,bloomHeight);
    gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(brightProgram);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sceneTex);
    gl.uniform1i(U.bright.texture,0);gl.uniform1f(U.bright.threshold,0.58);
    fullscreen(brightProgram,U.bright.position);

    gl.bindFramebuffer(gl.FRAMEBUFFER,bloomFBOB);gl.useProgram(blurProgram);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,bloomTexA);
    gl.uniform1i(U.blur.texture,0);gl.uniform2f(U.blur.direction,1/bloomWidth,0);
    fullscreen(blurProgram,U.blur.position);

    gl.bindFramebuffer(gl.FRAMEBUFFER,bloomFBOA);gl.useProgram(blurProgram);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,bloomTexB);
    gl.uniform1i(U.blur.texture,0);gl.uniform2f(U.blur.direction,0,1/bloomHeight);
    fullscreen(blurProgram,U.blur.position);

    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,renderWidth,renderHeight);gl.useProgram(postProgram);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sceneTex);gl.uniform1i(U.post.scene,0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,bloomTexA);gl.uniform1i(U.post.bloom,1);
    gl.uniform2f(U.post.resolution,renderWidth,renderHeight);gl.uniform1f(U.post.time,time);
    gl.uniform1f(U.post.strength,1.15);fullscreen(postProgram,U.post.position);
    gl.activeTexture(gl.TEXTURE0);
  }

  // ---------------------------------------------------------- audio y UI
  function ensureAudio(){
    if(!soundEnabled) return null;
    if(!audio){
      const AC=window.AudioContext||window.webkitAudioContext;
      if(!AC) return null;
      audio=new AC();
      audio.master=audio.createGain();
      audio.master.gain.value=0.26;
      audio.master.connect(audio.destination);
    }
    if(audio.state==='suspended') audio.resume();
    return audio;
  }
  function tone(freq,dur,type,vol,slideTo,delay){
    const ctx=ensureAudio(); if(!ctx) return;
    const t=ctx.currentTime+(delay||0);
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=type||'sine';osc.frequency.setValueAtTime(Math.max(20,freq),t);
    if(slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo),t+dur);
    gain.gain.setValueAtTime(0.0001,t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002,vol||0.1),t+0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    osc.connect(gain);gain.connect(ctx.master);osc.start(t);osc.stop(t+dur+0.03);
  }
  function sfx(name){
    if(!soundEnabled) return;
    switch(name){
      case 'click': tone(620,0.06,'triangle',0.055,720); break;
      case 'lane': tone(320,0.08,'sine',0.035,430); break;
      case 'coin': tone(880,0.07,'triangle',0.06,1180); tone(1320,0.1,'sine',0.035,1560,0.045); break;
      case 'jump': tone(280,0.2,'triangle',0.07,720); break;
      case 'land': tone(120,0.12,'sine',0.06,70); break;
      case 'hit': tone(140,0.3,'sawtooth',0.12,44); tone(80,0.4,'square',0.06,32,0.03); break;
      case 'magnet': tone(523,0.12,'sine',0.08,784); tone(784,0.14,'sine',0.07,1046,0.1); tone(1046,0.2,'triangle',0.055,1318,0.2); break;
      case 'finish': [523,659,784,1046].forEach((f,i)=>tone(f,0.55,'triangle',0.09,0,i*0.1)); break;
      case 'gameover': tone(220,0.6,'sawtooth',0.08,70); tone(170,0.8,'sine',0.06,50,0.12); break;
      default: break;
    }
  }

  const fmt=(n)=>Math.floor(n).toLocaleString('es-ES');
  const pad=(n,d)=>String(Math.max(0,Math.floor(n))).padStart(d,'0');
  function timeText(sec){
    const m=Math.floor(sec/60),s=Math.floor(sec%60);
    return pad(m,2)+':'+pad(s,2);
  }
  function scoreNow(){ return Math.floor(run.score+run.distance*1.6); }
  function levelLength(L){ return L.startZ-L.finishZ; }
  function currentLevel(){ return LEVELS[run.level]||LEVELS[0]; }
  function applyLevel(index){
    run.level=clamp(index,0,LEVELS.length-1);
    const L=currentLevel();
    CFG.baseSpeed=L.baseSpeed; CFG.boostSpeed=L.boostSpeed; CFG.brakeSpeed=L.brakeSpeed;
    return L;
  }
  function updateMenuBest(){
    ui.bestScore.textContent=pad(bestScore,6);
    ui.bestCoins.textContent=pad(bestCoins,2);
  }
  function renderLives(breakIndex){
    let html='';
    for(let i=0;i<CFG.maxLives;i++){
      const lost=i>=run.lives;
      html+='<span class="life'+(lost?' lost':'')+(breakIndex===i?' breaking':'')+'">❤</span>';
    }
    ui.lives.innerHTML=html;
  }
  let damageTimer=0,toastTimeout=0;
  function flashDamage(){
    ui.damage.classList.add('active');
    clearTimeout(damageTimer);
    damageTimer=setTimeout(()=>ui.damage.classList.remove('active'),80);
  }
  function showToast(text,type){
    ui.toast.textContent=text;
    ui.toast.className='toast show'+(type?' '+type:'');
    clearTimeout(toastTimeout);
    toastTimeout=setTimeout(()=>ui.toast.classList.remove('show'),1700);
  }
  function hideAllScreens(){
    [ui.menu,ui.help,ui.pause,ui.levelScreen,ui.victory,ui.defeat].forEach(s=>s.classList.add('is-hidden'));
  }
  function showHud(show){ ui.hud.classList.toggle('is-hidden',!show); }
  function updateHud(){
    const dist=Math.max(0,Math.min(CFG.startZ-CFG.finishZ,run.distance));
    const L=currentLevel();
    const levelDist=clamp(L.startZ-player.z,0,levelLength(L));
    const progress=clamp(levelDist/levelLength(L),0,1);
    ui.level.textContent=(run.level+1)+' / '+LEVELS.length;
    ui.levelName.textContent=L.name;
    ui.score.textContent=fmt(scoreNow());
    ui.coins.textContent=fmt(run.coins);
    ui.distance.textContent=Math.floor(dist)+' m';
    const kmh=Math.round(player.speed*6.25);
    ui.speed.textContent=kmh;
    ui.speedFill.style.transform='scaleX('+clamp(player.speed/CFG.boostSpeed,0.06,1)+')';
    ui.progressFill.style.transform='scaleX('+progress+')';
    ui.progressRunner.style.left=(progress*100)+'%';
    ui.progressPercent.textContent=Math.round(progress*100)+'%';
    if(run.combo>=2&&run.comboTimer>0){
      ui.combo.classList.remove('is-hidden'); ui.comboValue.textContent=run.combo;
    } else ui.combo.classList.add('is-hidden');
    if(player.magnet>0){
      ui.powerup.classList.remove('is-hidden');
      ui.powerupTime.textContent=player.magnet.toFixed(1)+'s';
    } else ui.powerup.classList.add('is-hidden');
  }

  function saveRecord(score,coins){
    const isRecord=score>bestScore;
    if(score>bestScore) bestScore=score;
    if(coins>bestCoins) bestCoins=coins;
    try{
      localStorage.setItem('neonRunBestScore',String(bestScore));
      localStorage.setItem('neonRunBestCoins',String(bestCoins));
    }catch(e){}
    updateMenuBest();
    return isRecord;
  }

  // ---------------------------------------------------------- mundo
  function resetPlayer(){
    player.x=0;player.z=CFG.startZ;player.y=0;player.vy=0;player.lane=1;player.speed=0;
    player.runPhase=0;player.grounded=true;player.invulnerable=0;player.magnet=0;
    player.hitPenalty=0;player.lean=0;player.roll=0;
  }

  function generateWorld(){
    coins=[];obstacles=[];powerups=[];
    const rng=mulberry32((Date.now()^(Math.random()*0xffffffff))>>>0);

    function addLow(z,lane,width){
      obstacles.push({x:lane===null?0:CFG.lanes[lane],z,width:width||2.55,height:1.4,hit:false,kind:'low'});
    }
    function addHigh(z,lane){
      obstacles.push({x:CFG.lanes[lane],z,width:2.55,height:3.3,hit:false,high:true,kind:'high'});
    }
    function addFullLow(z){
      obstacles.push({x:0,z,width:12.1,height:1.4,hit:false,full:true,kind:'low'});
    }
    function pushObstacle(z,kind){
      if(kind===0){
        addLow(z,(rng()*3)|0);
      }else if(kind===1){
        const free=(rng()*3)|0;
        for(let lane=0;lane<3;lane++) if(lane!==free) addLow(z,lane);
      }else{
        addFullLow(z);
      }
    }

    // Nivel 3: ritmo continuo de vallas y muros altos. Cada fila deja al
    // menos un carril seguro y alterna saltos obligatorios con cambios de carril.
    function buildGauntlet(L,rng){
      let z=L.startZ-86;
      let beat=0;
      let safe=1;
      while(z>L.finishZ+38){
        const phase=beat%8;
        if(phase===0||phase===4){
          addFullLow(z);
        }else if(phase===1||phase===5){
          addHigh(z,safe);
          safe=(safe+(rng()<0.5?1:2))%3;
        }else if(phase===2||phase===6){
          for(let lane=0;lane<3;lane++) if(lane!==safe) addLow(z,lane);
        }else{
          for(let lane=0;lane<3;lane++) if(lane!==safe) addHigh(z,lane);
        }
        beat++;
        z-=21+rng()*6;
        if(beat%8===0) z-=10+rng()*8;
      }
    }

    for(let li=0;li<LEVELS.length;li++){
      const L=LEVELS[li];
      const endZ=L.finishZ+26;
      const startZ=L.startZ-(li===0?32:24);

      // Rastros de monedas. En el nivel 3 alternan de carril y flotan en olas.
      let z=startZ;
      while(z>endZ){
        const lane=(rng()*3)|0;
        const span=L.coinGroup[1]-L.coinGroup[0]+1;
        const length=L.coinGroup[0]+((rng()*span)|0);
        const spacing=L.waveCoins?3.0:3.1;
        const lane2=(lane+(rng()<0.5?1:2))%3;
        const switchAt=Math.max(2,Math.floor(length*0.55));
        for(let i=0;i<length;i++){
          const cl=L.waveCoins&&i>=switchAt?lane2:lane;
          const y=L.waveCoins?1.05+Math.sin(i*0.88)*0.62:1.05;
          coins.push({x:CFG.lanes[cl]+(rng()-0.5)*0.14,y,z:z-i*spacing,phase:rng()*6.28,collected:false});
        }
        if(rng()<L.sideCoins&&length>=3){
          const sideLane=(lane+1+((rng()*2)|0))%3;
          const sideLen=Math.max(2,Math.min(length-1,3+((rng()*3)|0)));
          for(let i=0;i<sideLen;i++){
            const y=L.waveCoins?1.05+Math.sin(i*0.8+1.4)*0.52:1.05;
            coins.push({x:CFG.lanes[sideLane],y,z:z-1.7-i*spacing*1.04,phase:rng()*6.28,collected:false});
          }
        }
        z-=length*spacing+L.coinGap[0]+rng()*(L.coinGap[1]-L.coinGap[0]);
      }

      // Nivel 3 usa una secuencia tipo Subway Surfers; 1 y 2 mantienen
      // patrones aleatorios con dificultad progresiva.
      if(L.id===3){
        buildGauntlet(L,rng);
      }else{
        let oz=L.startZ-L.obstacleStart;
        while(oz>L.finishZ+34){
          const roll=rng();
          const kind=roll<L.pattern[0]?0:(roll<L.pattern[0]+L.pattern[1]?1:2);
          pushObstacle(oz,kind);
          if(rng()<L.combo){
            const comboZ=oz-(16+rng()*10);
            if(comboZ>L.finishZ+42){
              const r2=rng();
              pushObstacle(comboZ,r2<0.48?0:(r2<0.82?1:2));
            }
          }
          oz-=L.obstacleGap[0]+rng()*(L.obstacleGap[1]-L.obstacleGap[0]);
        }
      }

      // Cada nivel tiene al menos una barrera completa para practicar el salto.
      if(!obstacles.some(o=>o.full&&o.z<=L.startZ&&o.z>=L.finishZ)){
        const gz=L.startZ-levelLength(L)*(L.id===1?0.52:0.58);
        for(let i=obstacles.length-1;i>=0;i--){
          const o=obstacles[i];
          if(o.z<=L.startZ&&o.z>=L.finishZ&&Math.abs(o.z-gz)<7) obstacles.splice(i,1);
        }
        obstacles.push({x:0,z:gz,width:12.1,height:1.4,hit:false,full:true,kind:'low'});
      }

      // Imán: siempre en un carril despejado y dentro del tramo del nivel.
      for(const t of L.magnetAt){
        const mz=L.startZ-levelLength(L)*t;
        let lane=(rng()*3)|0;
        for(let tries=0;tries<3;tries++){
          const blocked=obstacles.some(o=>Math.abs(o.z-mz)<12&&(Math.abs(CFG.lanes[lane]-o.x)<o.width/2+0.65));
          if(!blocked) break;
          lane=(lane+1)%3;
        }
        powerups.push({x:CFG.lanes[lane],y:1.2,z:mz,phase:rng()*6.28,active:true});
      }
    }

    // Monedas en arco sobre las barreras completas.
    for(const o of obstacles){
      if(!o.full) continue;
      for(const c of coins){
        const dz=Math.abs(c.z-o.z);
        if(dz<8) c.y=Math.max(c.y,1.05+Math.max(0,1-dz/8)*1.35);
      }
    }

    // No colocar monedas dentro de los muros altos del nivel 3.
    const highWalls=obstacles.filter(o=>o.high);
    if(highWalls.length){
      coins=coins.filter(c=>!highWalls.some(o=>Math.abs(c.z-o.z)<2.8&&Math.abs(c.x-o.x)<1.9));
    }
    totalCoins=coins.length;
  }

  function resetRun(){
    run={lives:CFG.maxLives,coins:0,score:0,distance:0,combo:0,comboTimer:0,elapsed:0,level:0};
    applyLevel(0);
    resetPlayer();
    resetCity();
    for(const c of coins) c.collected=false;
    for(const o of obstacles) o.hit=false;
    for(const p of powerups) p.active=true;
    renderLives(-1);
  }

  // ---------------------------------------------------------- flujo de juego
  let countdownToken=0;
  function showCountdown(text,isGo){
    const token=++countdownToken;
    ui.countdown.textContent=text;
    ui.countdown.classList.remove('is-hidden','pop','go');
    void ui.countdown.offsetWidth;
    ui.countdown.classList.add('pop');
    if(isGo) ui.countdown.classList.add('go');
    if(isGo) setTimeout(()=>{ if(token===countdownToken) ui.countdown.classList.add('is-hidden'); },720);
  }
  function clearInputs(){
    input.left=input.right=input.boost=input.brake=input.jump=false;
    document.querySelectorAll('.touch-btn.held').forEach(b=>b.classList.remove('held'));
  }
  function startGame(){
    ensureAudio(); hideAllScreens(); showHud(true);
    generateWorld(); resetRun();
    state='COUNTDOWN'; countdownTimer=3; countdownStep=3;
    player.speed=0; menuTime=0; camera.fov=60; camera.shake=0;
    cameraPos[0]=0; cameraPos[1]=3.0; cameraPos[2]=player.z+6.6;
    cameraLook[0]=0; cameraLook[1]=1.95; cameraLook[2]=player.z-20.0;
    clearInputs(); updateHud(); showCountdown('3',false); sfx('click');
  }
  function goMenu(){
    state='MENU'; menuTime=0;
    generateWorld(); resetRun(); clearInputs();
    hideAllScreens(); showHud(false); ui.menu.classList.remove('is-hidden');
    ui.countdown.classList.add('is-hidden'); ui.toast.classList.remove('show');
    ui.damage.classList.remove('active'); updateMenuBest();
    camera.fov=55; camera.shake=0;
    cameraPos[0]=0; cameraPos[1]=2.9; cameraPos[2]=player.z+6.4;
    cameraLook[0]=0; cameraLook[1]=1.9; cameraLook[2]=player.z-20.0;
    setTimeout(()=>{ if(state==='MENU') ui.loading.classList.add('is-hidden'); },300);
  }
  function togglePause(){
    if(state==='PLAYING'){
      state='PAUSED'; ui.countdown.classList.add('is-hidden');
      ui.pauseScore.textContent=fmt(scoreNow());
      ui.pauseCoins.textContent=fmt(run.coins);
      ui.pauseDistance.textContent=Math.floor(run.distance)+' m';
      ui.pause.classList.remove('is-hidden'); clearInputs(); sfx('click');
    } else if(state==='PAUSED'){
      ui.pause.classList.add('is-hidden'); state='PLAYING'; ensureAudio(); clearInputs(); sfx('click');
    }
  }
  function goPauseMenu(){
    ui.pause.classList.add('is-hidden'); goMenu(); sfx('click');
  }
  function hitObstacle(o){
    if(player.invulnerable>0||o.hit||state!=='PLAYING') return;
    o.hit=true; run.lives--; run.combo=0; run.comboTimer=0;
    player.invulnerable=1.65; player.hitPenalty=0.95;
    player.speed=Math.max(7,player.speed*0.3);
    camera.shake=1.5; flashDamage(); hitBurst(o.x,1.1,o.z); sfx('hit');
    renderLives(run.lives);
    showToast(run.lives>0?'¡CHOQUE! −1 VIDA':'SISTEMA CRÍTICO','warn');
    if(run.lives<=0){
      state='DYING'; dyingTimer=1.2; clearInputs(); sfx('gameover'); camera.shake=1.9;
    }
  }
  function collectCoin(c){
    c.collected=true; run.coins++; run.combo=Math.min(20,run.combo+1); run.comboTimer=2.8;
    run.score+=CFG.coinValue*run.combo;
    coinBurst(c.x,c.y+Math.sin(time*3+c.phase)*0.16,c.z); sfx('coin');
  }
  function activateMagnet(p){
    p.active=false; player.magnet=CFG.magnetDuration; sfx('magnet');
    spawnParticles(p.x,p.y,p.z,22,COLORS.cyan,3.6,0.9,0.17,-2);
    spawnParticles(p.x,p.y,p.z,10,COLORS.pink,2.2,0.8,0.13,-1);
    showToast('IMÁN NEÓN ACTIVADO · ATRACCIÓN 8s','gold');
  }
  function changeLane(dir){
    if(state!=='PLAYING') return;
    const next=clamp(player.lane+dir,0,2);
    if(next!==player.lane){ player.lane=next; sfx('lane'); }
  }
  function jump(){
    if(state!=='PLAYING'||!player.grounded) return;
    player.vy=CFG.jumpVelocity; player.grounded=false;
    jumpBurst(player.x,0.1,player.z); sfx('jump');
  }
  function updateLevelSteps(done){
    if(!ui.levelSteps) return;
    const steps=ui.levelSteps.querySelectorAll('.level-step');
    steps.forEach((el,i)=>{
      el.classList.toggle('done',i<done);
      el.classList.toggle('current',i===done);
    });
  }
  function showLevelComplete(){
    if(state!=='PLAYING') return;
    const L=currentLevel(), nextIndex=run.level+1;
    state='LEVEL_COMPLETE';
    run.distance=clamp(CFG.startZ-player.z,0,CFG.startZ-CFG.finishZ);
    player.speed=0; player.magnet=0; player.invulnerable=0;
    clearInputs(); updateHud();
    ui.levelNumber.textContent=String(run.level+1);
    ui.levelCopy.textContent='Preparando Nivel '+(nextIndex+1)+'...';
    ui.levelScore.textContent=fmt(scoreNow());
    ui.levelCoins.textContent=fmt(run.coins);
    ui.levelLives.textContent=run.lives+' / '+CFG.maxLives;
    ui.levelPosition.textContent=(run.level+1)+' / '+LEVELS.length;
    ui.levelTime.textContent=timeText(run.elapsed);
    ui.btnNextLevel.innerHTML='SIGUIENTE NIVEL <span aria-hidden="true">→</span>';
    updateLevelSteps(nextIndex);
    hideAllScreens(); showHud(false); ui.levelScreen.classList.remove('is-hidden');
    ui.countdown.classList.add('is-hidden');
    finishBurst(L.finishZ); camera.shake=0.75; sfx('finish');
  }
  function advanceLevel(){
    if(state!=='LEVEL_COMPLETE') return;
    const nextIndex=run.level+1;
    if(nextIndex>=LEVELS.length) return;
    const L=applyLevel(nextIndex);
    player.z=Math.min(player.z,L.startZ);
    player.y=0; player.vy=0; player.grounded=true;
    player.hitPenalty=0; player.invulnerable=1.35; player.magnet=0;
    player.speed=0;
    hideAllScreens(); showHud(true); updateHud();
    state='COUNTDOWN'; countdownTimer=2; countdownStep=2;
    clearInputs(); showCountdown('2',false); sfx('click');
    showToast('NIVEL '+L.id+' · '+L.name,'gold');
  }
  function triggerFinish(){
    if(state!=='PLAYING') return;
    state='FINISHING'; finishTimer=1.45;
    run.distance=CFG.startZ-CFG.finishZ;
    run.score+=CFG.finishBonus+run.lives*CFG.lifeBonus;
    player.speed=Math.min(player.speed,20); player.magnet=0;
    finishBurst(CFG.finishZ); camera.shake=0.85; sfx('finish');
    updateLevelSteps(LEVELS.length);
    showToast('¡META CRUZADA! +'+fmt(CFG.finishBonus+run.lives*CFG.lifeBonus),'gold');
  }
  function showVictory(){
    state='VICTORY'; clearInputs();
    const finalScore=scoreNow();
    const isRecord=saveRecord(finalScore,run.coins);
    ui.victoryScore.textContent=fmt(finalScore);
    ui.victoryCoins.textContent=fmt(run.coins);
    ui.victoryTime.textContent=timeText(run.elapsed);
    ui.victoryLives.textContent=run.lives+' / '+CFG.maxLives;
    ui.victoryBest.textContent=fmt(bestScore);
    ui.victoryCopy.textContent='¡Felicidades, has superado la ciudad neón!';
    ui.victoryRecord.classList.toggle('is-hidden',!isRecord);
    hideAllScreens(); showHud(false); ui.victory.classList.remove('is-hidden');
    ui.countdown.classList.add('is-hidden');
  }
  function showDefeat(){
    state='DEFEAT'; clearInputs();
    const finalScore=scoreNow();
    const isRecord=saveRecord(finalScore,run.coins);
    ui.defeatScore.textContent=fmt(finalScore);
    ui.defeatCoins.textContent=fmt(run.coins);
    ui.defeatDistance.textContent=Math.floor(run.distance)+' m';
    ui.defeatLevel.textContent=(run.level+1)+' / '+LEVELS.length;
    ui.defeatBest.textContent=fmt(bestScore);
    ui.defeatRecord.classList.toggle('is-hidden',!isRecord);
    hideAllScreens(); showHud(false); ui.defeat.classList.remove('is-hidden');
    ui.countdown.classList.add('is-hidden');
  }

  // ---------------------------------------------------------- actualización
  function updateCountdown(dt){
    countdownTimer-=dt;
    player.runPhase+=dt*7;
    if(countdownTimer<=2&&countdownStep===3){countdownStep=2;showCountdown('2',false);}
    if(countdownTimer<=1&&countdownStep===2){countdownStep=1;showCountdown('1',false);}
    if(countdownTimer<=0&&countdownStep===1){
      countdownStep=0; state='PLAYING'; player.speed=CFG.baseSpeed*0.72;
      showCountdown('¡YA!',true); sfx('jump');
    }
  }

  function updateRunning(dt){
    const target=player.hitPenalty>0?CFG.brakeSpeed:(input.brake?CFG.brakeSpeed:(input.boost?CFG.boostSpeed:CFG.baseSpeed));
    const rate=target>player.speed?7.5:18;
    player.speed+=clamp(target-player.speed,-rate*dt,rate*dt);
    if(player.hitPenalty>0) player.hitPenalty-=dt;
    if(player.invulnerable>0) player.invulnerable-=dt;
    if(player.magnet>0) player.magnet=Math.max(0,player.magnet-dt);
    if(run.comboTimer>0){run.comboTimer-=dt;if(run.comboTimer<=0)run.combo=0;}

    const prevZ=player.z;
    player.z-=player.speed*dt;
    run.distance=clamp(CFG.startZ-player.z,0,CFG.startZ-CFG.finishZ);
    run.elapsed+=dt;
    player.x=damp(player.x,CFG.lanes[player.lane],11,dt);
    player.roll=damp(player.roll,clamp((CFG.lanes[player.lane]-player.x)*0.055,-0.16,0.16),8,dt);

    if(!player.grounded){
      player.vy-=CFG.gravity*dt; player.y+=player.vy*dt;
      if(player.y<=0){
        player.y=0;player.vy=0;player.grounded=true;
        spawnParticles(player.x,0.08,player.z,7,COLORS.cyan,1.6,0.4,0.1,-2.4); sfx('land');
      }
    }
    player.runPhase+=dt*(5+player.speed*0.24);
    player.lean=0.04+clamp(player.speed/CFG.boostSpeed,0,1)*0.13;

    const py=player.y+1.12;
    for(const c of coins){
      if(c.collected) continue;
      let dx=c.x-player.x,dy=c.y-py,dz=c.z-player.z;
      let d2=dx*dx+dy*dy+dz*dz;
      if(player.magnet>0&&d2<121){
        c.x=damp(c.x,player.x,4.5,dt); c.z=damp(c.z,player.z,4.5,dt);
        c.y=damp(c.y,py,4.5,dt);
        dx=c.x-player.x;dy=c.y-py;dz=c.z-player.z;d2=dx*dx+dy*dy+dz*dz;
      }
      if(d2<1.35*1.35) collectCoin(c);
    }

    for(const o of obstacles){
      if(o.hit) continue;
      if(o.z<=prevZ+0.8&&o.z>=player.z-1.2){
        const half=o.width/2;
        if(Math.abs(player.x-o.x)<half+0.3){
          if(o.high){ hitObstacle(o); if(state!=='PLAYING') return; }
          else if(player.y>1.22){ /* salto limpio */ }
          else { hitObstacle(o); if(state!=='PLAYING') return; }
        }
      }
    }

    for(const p of powerups){
      if(!p.active) continue;
      if(p.z<=prevZ+0.8&&p.z>=player.z-1.3&&Math.abs(p.x-player.x)<1.25&&player.y<2.2) activateMagnet(p);
    }

    if(player.speed>26&&Math.random()<dt*32){
      spawnParticles(player.x+rand(-0.65,0.65),0.12,player.z+1.1,1,Math.random()<0.5?COLORS.cyan:COLORS.pink,0.5,0.38,0.085,0);
    }

    updateHud();
    if(player.z<=currentLevel().finishZ){
      if(run.level<LEVELS.length-1) showLevelComplete();
      else triggerFinish();
    }
  }

  function updateMenu(dt){
    menuTime+=dt; player.runPhase+=dt*7.5;
    player.roll=Math.sin(menuTime*0.7)*0.02;
    if(Math.random()<dt*7){
      const col=Math.random()<0.5?COLORS.cyan:(Math.random()<0.5?COLORS.pink:COLORS.gold);
      spawnParticles(rand(-6,6),rand(0.2,4.5),player.z-rand(0,32),1,col,0.15,1.1,rand(0.05,0.11),-0.15);
    }
  }

  function updateDying(dt){
    player.speed=damp(player.speed,0,3.5,dt); player.z-=player.speed*dt;
    player.runPhase+=dt*4; dyingTimer-=dt;
    camera.shake=Math.max(camera.shake,damp(camera.shake,0,2,dt));
    updateHud();
    if(dyingTimer<=0) showDefeat();
  }
  function updateFinishing(dt){
    player.speed=damp(player.speed,2,3,dt); player.z-=player.speed*dt;
    player.runPhase+=dt*4; finishTimer-=dt; updateHud();
    if(finishTimer<=0) showVictory();
  }

  function update(dt){
    ensureCity();
    if(state!=='PAUSED') updateParticles(dt);
    switch(state){
      case 'MENU': updateMenu(dt); break;
      case 'COUNTDOWN': updateCountdown(dt); break;
      case 'PLAYING': updateRunning(dt); break;
      case 'DYING': updateDying(dt); break;
      case 'FINISHING': updateFinishing(dt); break;
      default: break;
    }
  }

  // ---------------------------------------------------------- controles
  function updateSoundButton(){
    ui.soundIcon.textContent=soundEnabled?'🔊':'🔇';
    ui.btnSound.classList.toggle('muted',!soundEnabled);
    ui.btnSound.setAttribute('aria-label',soundEnabled?'Silenciar sonido':'Activar sonido');
  }
  function toggleSound(){
    soundEnabled=!soundEnabled;
    try{localStorage.setItem('neonRunMuted',soundEnabled?'0':'1');}catch(e){}
    updateSoundButton();
    if(soundEnabled){ensureAudio();sfx('click');}
  }
  try{ soundEnabled=localStorage.getItem('neonRunMuted')!=='1'; }catch(e){}

  function onKeyDown(e){
    const key=e.key;
    if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Spacebar'].includes(key)) e.preventDefault();
    if(e.repeat) return;
    if(key==='ArrowLeft'){ if(state==='PLAYING') changeLane(-1); }
    else if(key==='ArrowRight'){ if(state==='PLAYING') changeLane(1); }
    else if(key==='ArrowUp'){ input.boost=true; input.brake=false; }
    else if(key==='ArrowDown'){ input.brake=true; input.boost=false; }
    else if(key===' '||key==='Spacebar'){ if(state==='PLAYING') jump(); else if(state==='MENU') startGame(); else if(state==='LEVEL_COMPLETE') advanceLevel(); }
    else if(key==='p'||key==='P'){ togglePause(); }
    else if(key==='Escape'){
      if(state==='PAUSED') togglePause();
      else if(state==='PLAYING') togglePause();
      else if(state==='LEVEL_COMPLETE') goMenu();
      else if(!ui.help.classList.contains('is-hidden')){ui.help.classList.add('is-hidden');ui.menu.classList.remove('is-hidden');}
    }
    else if(key==='m'||key==='M'){ toggleSound(); }
    else if(key==='r'||key==='R'){
      if(state==='PLAYING'||state==='PAUSED'||state==='DYING'||state==='LEVEL_COMPLETE'||state==='VICTORY'||state==='DEFEAT') startGame();
    }
    else if(key==='Enter'){
      if(state==='MENU') startGame();
      else if(state==='LEVEL_COMPLETE') advanceLevel();
    }
  }
  function onKeyUp(e){
    if(e.key==='ArrowUp') input.boost=false;
    if(e.key==='ArrowDown') input.brake=false;
  }

  function bindEvents(){
    document.addEventListener('keydown',onKeyDown);
    document.addEventListener('keyup',onKeyUp);
    $('btn-start').addEventListener('click',()=>{ensureAudio();startGame();});
    $('btn-howto').addEventListener('click',()=>{ensureAudio();sfx('click');ui.menu.classList.add('is-hidden');ui.help.classList.remove('is-hidden');});
    $('btn-help-close').addEventListener('click',()=>{sfx('click');ui.help.classList.add('is-hidden');ui.menu.classList.remove('is-hidden');});
    $('btn-help-start').addEventListener('click',()=>startGame());
    $('btn-sound').addEventListener('click',toggleSound);
    $('btn-pause').addEventListener('click',togglePause);
    $('btn-resume').addEventListener('click',togglePause);
    $('btn-pause-restart').addEventListener('click',startGame);
    $('btn-pause-menu').addEventListener('click',goPauseMenu);
    $('btn-next-level').addEventListener('click',advanceLevel);
    $('btn-level-menu').addEventListener('click',goMenu);
    $('btn-victory-again').addEventListener('click',startGame);
    $('btn-victory-menu').addEventListener('click',goMenu);
    $('btn-defeat-retry').addEventListener('click',startGame);
    $('btn-defeat-menu').addEventListener('click',goMenu);
    window.addEventListener('resize',resize);

    document.querySelectorAll('[data-action]').forEach(btn=>{
      const action=btn.dataset.action;
      const release=()=>{
        btn.classList.remove('held');
        if(action==='boost') input.boost=false;
        if(action==='brake') input.brake=false;
      };
      btn.addEventListener('pointerdown',(e)=>{
        e.preventDefault(); ensureAudio(); btn.classList.add('held');
        if(action==='left') changeLane(-1);
        else if(action==='right') changeLane(1);
        else if(action==='jump') jump();
        else if(action==='boost'){input.boost=true;input.brake=false;}
        else if(action==='brake'){input.brake=true;input.boost=false;}
        if(btn.setPointerCapture) try{btn.setPointerCapture(e.pointerId);}catch(err){}
      });
      btn.addEventListener('pointerup',release);
      btn.addEventListener('pointercancel',release);
      btn.addEventListener('pointerleave',release);
    });

    let swipeStart=null;
    canvas.addEventListener('pointerdown',(e)=>{
      if(e.pointerType==='touch') swipeStart={x:e.clientX,y:e.clientY};
    });
    canvas.addEventListener('pointerup',(e)=>{
      if(!swipeStart||e.pointerType!=='touch') return;
      const dx=e.clientX-swipeStart.x, dy=e.clientY-swipeStart.y;
      swipeStart=null;
      if(state!=='PLAYING') return;
      if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)) changeLane(dx>0?1:-1);
      else if(dy<-42) jump();
    });
    canvas.addEventListener('pointercancel',()=>{swipeStart=null;});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='PLAYING') togglePause();});
    window.addEventListener('blur',()=>{clearInputs(); if(state==='PLAYING') togglePause();});
  }

  // ---------------------------------------------------------- bucle
  function frame(now){
    requestAnimationFrame(frame);
    if(!lastFrame) lastFrame=now;
    let dt=(now-lastFrame)/1000; lastFrame=now;
    if(dt>0.05) dt=0.05;
    if(dt<0) dt=0;
    time+=dt;
    update(dt);
    updateCamera(dt);
    render();
  }

  function init(){
    if(window.matchMedia&&window.matchMedia('(hover: none), (pointer: coarse)').matches) document.body.classList.add('touch-mode');
    bindEvents(); resize(); updateSoundButton(); updateMenuBest();
    generateWorld(); resetRun(); state='MENU';
    hideAllScreens(); showHud(false); ui.menu.classList.remove('is-hidden');
    cameraPos[0]=0;cameraPos[1]=2.9;cameraPos[2]=player.z+6.4;
    cameraLook[0]=0;cameraLook[1]=1.9;cameraLook[2]=player.z-20.0;
    camera.fov=55;
    ui.loadingFill.style.width='100%';
    setTimeout(()=>ui.loading.classList.add('is-hidden'),650);
    requestAnimationFrame(frame);
  }

  // API de depuración opcional: añade ?debug=1 a la URL para activarla.
  if(location.search.indexOf('debug=1')>=0){
    window.__neonRun = {
      get state(){ return state; },
      get player(){ return player; },
      get run(){ return run; },
      get coins(){ return coins; },
      get obstacles(){ return obstacles; },
      get powerups(){ return powerups; },
      get city(){ return city.objects; },
      get cityMeshes(){ return cityMeshes; },
      get gl(){ return gl; },
      startGame, goMenu, togglePause, jump, changeLane,
      advance(dt){ time+=dt; update(dt); updateCamera(dt); },
      draw(){ render(); },
      snapshot(){ render(); return canvas.toDataURL('image/jpeg',0.72); },
      world(){ return {coins:coins.length,obstacles:obstacles.length,powerups:powerups.length,totalCoins,city:city.objects.length,cityDrawn,highWalls:obstacles.filter(o=>o.high).length,cityMeshes:cityMeshes.map(a=>a.length)}; },
      // Proyecta un punto del mundo a coordenadas de pantalla (para depurar la cámara).
      project(x,y,z){
        const v=[x,y,z];
        const out=[0,0,0,0];
        const m=M4.create();
        M4.multiply(m,projection,view);
        // multiplicación matriz-vector
        out[0]=m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12];
        out[1]=m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13];
        out[2]=m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14];
        out[3]=m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15];
        return {
          clip: out.slice(),
          ndc: [out[0]/out[3], out[1]/out[3], out[2]/out[3]],
          px: (out[0]/out[3]*0.5+0.5)*renderWidth,
          py: (1-(out[1]/out[3]*0.5+0.5))*renderHeight,
          width: renderWidth, height: renderHeight
        };
      },
      camera(){ return {pos:cameraPos.slice(), look:cameraLook.slice(), fov:camera.fov}; }
    };
  }

  init();
})();


