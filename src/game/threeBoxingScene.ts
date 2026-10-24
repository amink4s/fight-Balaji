/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DefenseAction, OpponentFaceState, PunchType } from '../types/boxing';

// Module-level reusable math objects (Zero GC in loop)
const _vec3 = new THREE.Vector3();
const _targetHeadPos = new THREE.Vector3();
const _targetHeadRot = new THREE.Euler();
const _targetOpponentPos = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();

export interface BoxingSceneOptions {
  container: HTMLDivElement;
  onSceneReady?: (scene: ThreeBoxingScene) => void;
}

export class ThreeBoxingScene {
  private container: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean = false;
  private frameId: number = 0;
  private clock: THREE.Clock = new THREE.Clock();
  private destroyed: boolean = false;

  // 3D Objects
  private opponentGroup!: THREE.Group;
  private opponentHeadGroup!: THREE.Group;
  private headMesh!: THREE.Mesh;
  private headMat!: THREE.MeshStandardMaterial;
  private opponentTorso!: THREE.Mesh;
  private leftArmGroup!: THREE.Group;
  private rightArmGroup!: THREE.Group;
  private leftGloveMesh!: THREE.Mesh;
  private rightGloveMesh!: THREE.Mesh;
  private trunksMesh!: THREE.Mesh;

  // Player Gloves (First Person)
  private playerLeftGlove!: THREE.Group;
  private playerRightGlove!: THREE.Group;
  private playerGloveMat!: THREE.MeshStandardMaterial;

  // Textures
  private normalTexture!: THREE.Texture;
  private hurtTexture!: THREE.Texture;
  private beatTexture!: THREE.Texture;
  private currentFaceState: OpponentFaceState = 'normal';

  // Ring ropes & ropes animation
  private ringRopes: THREE.Mesh[] = [];

  // Hit particle system
  private particleGeo!: THREE.BufferGeometry;
  private particleMat!: THREE.PointsMaterial;
  private particles!: THREE.Points;
  private particlePositions!: Float32Array;
  private particleVelocities!: Float32Array;
  private particleLife!: Float32Array;
  private maxParticles = 60;

  // Dynamic animation state
  public opponentStanceTime: number = 0;
  public opponentStunned: boolean = false;
  public opponentKnockedDown: boolean = false;
  public opponentBlocking: boolean = false;
  public opponentPunching: {
    arm: 'left' | 'right';
    progress: number;
    active: boolean;
    type: PunchType;
  } = { arm: 'left', progress: 0, active: false, type: 'jab' };

  // Recoil physics
  private headRecoil = {
    x: 0,
    y: 0,
    z: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    vrx: 0,
    vry: 0,
    vrz: 0,
  };

  private cameraShake = { x: 0, y: 0, decay: 0 };
  private playerDodgeState: DefenseAction = 'none';

  // Player punch animation tracking
  private playerPunchState = {
    arm: 'left' as 'left' | 'right',
    progress: 1, // 1 = returned to rest
    type: 'jab' as PunchType,
  };

  constructor(options: BoxingSceneOptions) {
    this.container = options.container;
    this.init();
    if (options.onSceneReady) {
      options.onSceneReady(this);
    }
  }

  private init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Detect software WebGL
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // Scene & Camera
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c12);
    this.scene.fog = new THREE.FogExp2(0x0a0c12, 0.045);

    this.camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 40);
    this.camera.position.set(0, 1.62, 1.35); // Eye level looking at opponent
    this.camera.lookAt(0, 1.58, -0.6);

    // Studio Environment
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Lighting
    this.setupLighting();

    // Ring & Arena
    this.setupArena();

    // Face Textures
    this.loadFaceTextures();

    // Opponent 3D model
    this.setupOpponentModel();

    // Player Foreground Gloves
    this.setupPlayerGloves();

    // Hit Particle System
    this.setupParticles();

    // Resize listener
    window.addEventListener('resize', this.onWindowResize);

    // Start tick
    this.tick();
  }

  private setupLighting() {
    // Cool ambient hemisphere fill
    const hemiLight = new THREE.HemisphereLight(0x446699, 0x111122, 0.9);
    this.scene.add(hemiLight);

    // Warm overhead key light centered over the ring
    const keySpot = new THREE.SpotLight(0xfff3db, 3.5);
    keySpot.position.set(0, 5.5, 0.2);
    keySpot.angle = Math.PI / 3.2;
    keySpot.penumbra = 0.55;
    keySpot.decay = 1.2;
    keySpot.distance = 12;
    if (!this.isSoftwareGl) {
      keySpot.castShadow = true;
      keySpot.shadow.bias = -0.0005;
      keySpot.shadow.mapSize.width = 1024;
      keySpot.shadow.mapSize.height = 1024;
    }
    this.scene.add(keySpot);

    // Dramatic Rim lights from left & right corners
    const leftRim = new THREE.DirectionalLight(0x00c8ff, 1.2);
    leftRim.position.set(-3.5, 3, -2);
    this.scene.add(leftRim);

    const rightRim = new THREE.DirectionalLight(0xff4433, 1.2);
    rightRim.position.set(3.5, 3, -2);
    this.scene.add(rightRim);
  }

  private createRingCanvasTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // Canvas background
    ctx.fillStyle = '#161822';
    ctx.fillRect(0, 0, 1024, 1024);

    // Textured canvas weave
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 1024; i += 8) {
      ctx.fillRect(i, 0, 4, 1024);
      ctx.fillRect(0, i, 1024, 4);
    }

    // Outer ring border
    ctx.strokeStyle = '#c59a3f';
    ctx.lineWidth = 14;
    ctx.strokeRect(60, 60, 904, 904);

    ctx.strokeStyle = 'rgba(197, 154, 63, 0.3)';
    ctx.lineWidth = 4;
    ctx.strokeRect(85, 85, 854, 854);

    // Center emblem circle
    ctx.beginPath();
    ctx.arc(512, 512, 280, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.35)';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(512, 512, 230, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Center logo text
    ctx.fillStyle = '#f3f4f6';
    ctx.font = 'bold 74px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('APEX BOXER', 512, 475);

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('CHAMPIONSHIP ARENA', 512, 550);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    return texture;
  }

  private setupArena() {
    const arenaGroup = new THREE.Group();

    // Canvas ring floor (4.8m x 4.8m)
    const floorGeo = new THREE.BoxGeometry(4.8, 0.4, 4.8);
    const canvasTex = this.createRingCanvasTexture();
    const floorMat = new THREE.MeshStandardMaterial({
      map: canvasTex,
      roughness: 0.85,
      metalness: 0.05,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.2;
    floorMesh.receiveShadow = !this.isSoftwareGl;
    arenaGroup.add(floorMesh);

    // Soft contact shadow plane on canvas beneath opponent
    const shadowGeo = new THREE.PlaneGeometry(1.6, 1.6);
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 128, 128);
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.8,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.set(0, 0.005, -0.6);
    arenaGroup.add(shadowMesh);

    // 4 Corner Posts
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.8, 16);
    const postMatRed = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.3, metalness: 0.6 });
    const postMatBlue = new THREE.MeshStandardMaterial({ color: 0x2255cc, roughness: 0.3, metalness: 0.6 });
    const postMatWhite = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4, metalness: 0.5 });

    const cornerCoords = [
      { x: -2.2, z: -2.2, mat: postMatRed },
      { x: 2.2, z: -2.2, mat: postMatBlue },
      { x: -2.2, z: 2.2, mat: postMatWhite },
      { x: 2.2, z: 2.2, mat: postMatWhite },
    ];

    cornerCoords.forEach((c) => {
      const post = new THREE.Mesh(postGeo, c.mat);
      post.position.set(c.x, 0.9, c.z);
      arenaGroup.add(post);

      // Padded turnbuckle pads
      const padGeo = new THREE.BoxGeometry(0.3, 1.2, 0.3);
      const pad = new THREE.Mesh(padGeo, c.mat);
      pad.position.set(c.x * 0.94, 0.9, c.z * 0.94);
      arenaGroup.add(pad);
    });

    // 4 Ropes per side (heights: 0.5, 0.8, 1.1, 1.4)
    const ropeHeights = [0.45, 0.75, 1.05, 1.35];
    const ropeMatRed = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.4 });
    const ropeMatWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const ropeMatBlue = new THREE.MeshStandardMaterial({ color: 0x2255cc, roughness: 0.4 });

    ropeHeights.forEach((h, idx) => {
      const mat = idx % 3 === 0 ? ropeMatRed : idx % 3 === 1 ? ropeMatWhite : ropeMatBlue;

      // North rope (back)
      const ropeN = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4.4, 8), mat);
      ropeN.rotation.z = Math.PI / 2;
      ropeN.position.set(0, h, -2.2);
      arenaGroup.add(ropeN);
      this.ringRopes.push(ropeN);

      // South rope (front)
      const ropeS = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4.4, 8), mat);
      ropeS.rotation.z = Math.PI / 2;
      ropeS.position.set(0, h, 2.2);
      arenaGroup.add(ropeS);
      this.ringRopes.push(ropeS);

      // West rope (left)
      const ropeW = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4.4, 8), mat);
      ropeW.rotation.x = Math.PI / 2;
      ropeW.position.set(-2.2, h, 0);
      arenaGroup.add(ropeW);
      this.ringRopes.push(ropeW);

      // East rope (right)
      const ropeE = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4.4, 8), mat);
      ropeE.rotation.x = Math.PI / 2;
      ropeE.position.set(2.2, h, 0);
      arenaGroup.add(ropeE);
      this.ringRopes.push(ropeE);
    });

    // Overhead truss / arena lamps
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x33333b, metalness: 0.8, roughness: 0.3 });
    const trussBar = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 4.4), trussMat);
    trussBar.position.set(0, 5.6, 0);
    arenaGroup.add(trussBar);

    this.scene.add(arenaGroup);
  }

  private loadFaceTextures() {
    const loader = new THREE.TextureLoader();

    // Prefer webp with transparent channel, fall back to png
    const tryLoad = (baseName: string) => {
      const tex = loader.load(`/assets/faces/${baseName}.webp`, undefined, undefined, () => {
        // Fallback to png
        tex.image = loader.load(`/assets/faces/${baseName}.png`).image;
        tex.needsUpdate = true;
      });
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return tex;
    };

    this.normalTexture = tryLoad('face_normal');
    this.hurtTexture = tryLoad('face_hurt');
    this.beatTexture = tryLoad('face_beat');
  }

  private setupOpponentModel() {
    this.opponentGroup = new THREE.Group();
    this.opponentGroup.position.set(0, 0, -0.65);

    // Shared Skin material
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xc89675,
      roughness: 0.65,
      metalness: 0.05,
    });

    // Torso group (chest, abs, waistband)
    const torsoGroup = new THREE.Group();

    // Upper chest
    const chestGeo = new THREE.BoxGeometry(0.66, 0.44, 0.34);
    const chestMesh = new THREE.Mesh(chestGeo, skinMat);
    chestMesh.position.y = 1.34;
    chestMesh.castShadow = !this.isSoftwareGl;
    torsoGroup.add(chestMesh);

    // Mid abs
    const absGeo = new THREE.BoxGeometry(0.56, 0.32, 0.28);
    const absMesh = new THREE.Mesh(absGeo, skinMat);
    absMesh.position.y = 1.0;
    torsoGroup.add(absMesh);

    // Trunks / Shorts
    const trunksMat = new THREE.MeshStandardMaterial({
      color: 0x181822,
      roughness: 0.5,
      metalness: 0.2,
    });
    this.trunksMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.45, 18), trunksMat);
    this.trunksMesh.position.y = 0.66;
    torsoGroup.add(this.trunksMesh);

    // Gold belt waistband
    const beltMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      metalness: 0.8,
      roughness: 0.2,
    });
    const waistband = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 18), beltMat);
    waistband.position.y = 0.88;
    torsoGroup.add(waistband);

    this.opponentTorso = chestMesh;
    this.opponentGroup.add(torsoGroup);

    // Opponent Head Group
    this.opponentHeadGroup = new THREE.Group();
    this.opponentHeadGroup.position.set(0, 1.62, 0.02);

    // Neck
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.18, 12), skinMat);
    neckMesh.position.set(0, -0.08, 0);
    this.opponentHeadGroup.add(neckMesh);

    // 3D Head Skull (back/sides/ears)
    const skullMat = new THREE.MeshStandardMaterial({
      color: 0x221c1a, // Dark hair back
      roughness: 0.85,
      metalness: 0.05,
    });
    const skullMesh = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 20), skullMat);
    skullMesh.scale.set(0.95, 1.2, 0.95);
    skullMesh.position.set(0, 0.08, -0.06);
    this.opponentHeadGroup.add(skullMesh);

    // Face Plane / Screen with actual face texture
    const faceGeo = new THREE.PlaneGeometry(0.54, 0.58);
    this.headMat = new THREE.MeshStandardMaterial({
      map: this.normalTexture,
      transparent: true,
      roughness: 0.65,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.headMesh = new THREE.Mesh(faceGeo, this.headMat);
    this.headMesh.position.set(0, 0.08, 0.16); // Placed flush in front of head skull
    this.opponentHeadGroup.add(this.headMesh);

    this.opponentGroup.add(this.opponentHeadGroup);

    // Opponent Arms & Gloves
    const gloveMat = new THREE.MeshStandardMaterial({
      color: 0xd92626, // Crimson opponent gloves
      roughness: 0.3,
      metalness: 0.4,
    });

    // Left Arm
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-0.38, 1.4, 0);
    const leftArmBicep = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.3, 10), skinMat);
    leftArmBicep.position.set(0, -0.15, 0.05);
    this.leftArmGroup.add(leftArmBicep);

    this.leftGloveMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), gloveMat);
    this.leftGloveMesh.scale.set(0.9, 1.2, 1.1);
    this.leftGloveMesh.position.set(0.12, -0.15, 0.38);
    this.leftArmGroup.add(this.leftGloveMesh);
    this.opponentGroup.add(this.leftArmGroup);

    // Right Arm
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.38, 1.4, 0);
    const rightArmBicep = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.3, 10), skinMat);
    rightArmBicep.position.set(0, -0.15, 0.05);
    this.rightArmGroup.add(rightArmBicep);

    this.rightGloveMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 16), gloveMat);
    this.rightGloveMesh.scale.set(0.9, 1.2, 1.1);
    this.rightGloveMesh.position.set(-0.12, -0.15, 0.38);
    this.rightArmGroup.add(this.rightGloveMesh);
    this.opponentGroup.add(this.rightArmGroup);

    this.scene.add(this.opponentGroup);
  }

  private setupPlayerGloves() {
    this.playerGloveMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb, // Default Blue champion gloves
      roughness: 0.25,
      metalness: 0.5,
    });

    const createGlove = () => {
      const g = new THREE.Group();
      // Main fist
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 18), this.playerGloveMat);
      fist.scale.set(1.0, 1.25, 1.3);
      g.add(fist);

      // Thumb
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.1, 8, 8), this.playerGloveMat);
      thumb.position.set(0.1, -0.02, 0.06);
      thumb.rotation.z = -0.4;
      g.add(thumb);

      // Wrist cuff
      const cuffMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.14, 14), cuffMat);
      cuff.position.set(0, -0.12, -0.06);
      cuff.rotation.x = 0.2;
      g.add(cuff);

      return g;
    };

    this.playerLeftGlove = createGlove();
    this.playerRightGlove = createGlove();

    // Default resting guard position in camera view
    this.playerLeftGlove.position.set(-0.28, 1.34, 0.7);
    this.playerRightGlove.position.set(0.28, 1.34, 0.7);

    this.scene.add(this.playerLeftGlove);
    this.scene.add(this.playerRightGlove);
  }

  public updatePlayerCustomization(gloveColor: string, _trunksColor: string) {
    if (this.playerGloveMat) {
      this.playerGloveMat.color.set(gloveColor);
    }
  }

  public updateOpponentTrunks(color: string) {
    if (this.trunksMesh && this.trunksMesh.material instanceof THREE.MeshStandardMaterial) {
      this.trunksMesh.material.color.set(color);
    }
  }

  private setupParticles() {
    this.particleGeo = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(this.maxParticles * 3);
    this.particleVelocities = new Float32Array(this.maxParticles * 3);
    this.particleLife = new Float32Array(this.maxParticles);

    // Initialize all off-screen
    for (let i = 0; i < this.maxParticles; i++) {
      this.particlePositions[i * 3 + 1] = -100;
      this.particleLife[i] = 0;
    }

    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));

    // Particle texture (glow spark)
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 32;
    pCanvas.height = 32;
    const pCtx = pCanvas.getContext('2d')!;
    const grad = pCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 245, 180, 1)');
    grad.addColorStop(0.4, 'rgba(255, 180, 50, 0.8)');
    grad.addColorStop(1, 'rgba(255, 100, 20, 0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 32, 32);
    const pTex = new THREE.CanvasTexture(pCanvas);

    this.particleMat = new THREE.PointsMaterial({
      size: 0.12,
      map: pTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particles = new THREE.Points(this.particleGeo, this.particleMat);
    this.scene.add(this.particles);
  }

  public emitHitSparks(worldX: number, worldY: number, worldZ: number, count: number = 18, isCrit: boolean = false) {
    let spawned = 0;
    for (let i = 0; i < this.maxParticles && spawned < count; i++) {
      if (this.particleLife[i] <= 0) {
        this.particleLife[i] = 0.25 + Math.random() * 0.25;
        this.particlePositions[i * 3] = worldX + (Math.random() - 0.5) * 0.1;
        this.particlePositions[i * 3 + 1] = worldY + (Math.random() - 0.5) * 0.1;
        this.particlePositions[i * 3 + 2] = worldZ + (Math.random() - 0.5) * 0.1;

        const speed = isCrit ? 2.5 : 1.5;
        this.particleVelocities[i * 3] = (Math.random() - 0.5) * speed;
        this.particleVelocities[i * 3 + 1] = Math.random() * speed * 0.8 + 0.4;
        this.particleVelocities[i * 3 + 2] = (Math.random() - 0.5) * speed;

        spawned++;
      }
    }
    this.particleGeo.attributes.position.needsUpdate = true;
  }

  public setFaceState(state: OpponentFaceState) {
    if (this.currentFaceState === state) return;
    this.currentFaceState = state;
    if (state === 'normal') {
      this.headMat.map = this.normalTexture;
    } else if (state === 'hurt') {
      this.headMat.map = this.hurtTexture;
    } else if (state === 'beat') {
      this.headMat.map = this.beatTexture;
    }
    this.headMat.needsUpdate = true;
  }

  public triggerPlayerPunch(type: PunchType) {
    const isLeft = type === 'jab' || type === 'left_hook';
    this.playerPunchState = {
      arm: isLeft ? 'left' : 'right',
      progress: 0,
      type,
    };
  }

  public triggerOpponentPunch(arm: 'left' | 'right', type: PunchType) {
    this.opponentPunching = {
      arm,
      progress: 0,
      active: true,
      type,
    };
  }

  public triggerHitRecoil(type: PunchType, isCrit: boolean) {
    const mult = isCrit ? 1.6 : 1.0;
    switch (type) {
      case 'jab':
        this.headRecoil.vz = -1.8 * mult;
        this.headRecoil.vrx = -0.6 * mult;
        this.headRecoil.vry = 0.4 * mult;
        break;
      case 'cross':
        this.headRecoil.vz = -2.8 * mult;
        this.headRecoil.vrx = -0.9 * mult;
        this.headRecoil.vry = -0.8 * mult;
        break;
      case 'left_hook':
        this.headRecoil.vx = 0.9 * mult;
        this.headRecoil.vry = 2.4 * mult;
        this.headRecoil.vrz = 0.6 * mult;
        break;
      case 'right_hook':
        this.headRecoil.vx = -0.9 * mult;
        this.headRecoil.vry = -2.4 * mult;
        this.headRecoil.vrz = -0.6 * mult;
        break;
      case 'uppercut':
        this.headRecoil.vy = 1.4 * mult;
        this.headRecoil.vrx = -2.2 * mult;
        this.headRecoil.vz = -1.2 * mult;
        break;
    }

    // Trigger hit sparks at opponent face location
    this.emitHitSparks(0, 1.65, -0.5, isCrit ? 26 : 14, isCrit);

    // Camera hit shake
    this.cameraShake.x = (Math.random() - 0.5) * (isCrit ? 0.08 : 0.04);
    this.cameraShake.y = (Math.random() - 0.5) * (isCrit ? 0.08 : 0.04);
    this.cameraShake.decay = 0.25;
  }

  public triggerPlayerDamage() {
    // Camera heavy shake when player gets hit
    this.cameraShake.x = (Math.random() - 0.5) * 0.12;
    this.cameraShake.y = (Math.random() - 0.5) * 0.12;
    this.cameraShake.decay = 0.35;
  }

  public setDefenseState(action: DefenseAction) {
    this.playerDodgeState = action;
  }

  public setOpponentKnockedDown(knocked: boolean) {
    this.opponentKnockedDown = knocked;
    if (knocked) {
      this.setFaceState('beat');
    }
  }

  private onWindowResize = () => {
    if (!this.container || this.destroyed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private tick = () => {
    if (this.destroyed) return;
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.opponentStanceTime += delta;

    // 1. Update Opponent Physics & Kinematics
    this.updateOpponentKinematics(delta);

    // 2. Update Player Glove First-Person Animations
    this.updatePlayerGloveKinematics(delta);

    // 3. Update Camera Sway & Shake
    this.updateCamera(delta);

    // 4. Update Particle Sparks
    this.updateParticles(delta);

    // 5. Render frame
    this.renderer.render(this.scene, this.camera);

    this.frameId = requestAnimationFrame(this.tick);
  };

  private updateOpponentKinematics(delta: number) {
    const time = this.opponentStanceTime;

    if (this.opponentKnockedDown) {
      // Knockdown collapse animation
      _targetOpponentPos.set(0, -0.85, -0.9);
      this.opponentGroup.position.lerp(_targetOpponentPos, delta * 4);
      this.opponentGroup.rotation.x = THREE.MathUtils.damp(this.opponentGroup.rotation.x, -Math.PI / 2.3, 5, delta);
      this.opponentHeadGroup.rotation.x = THREE.MathUtils.damp(this.opponentHeadGroup.rotation.x, -0.6, 4, delta);
      this.leftArmGroup.position.y = THREE.MathUtils.damp(this.leftArmGroup.position.y, 0.4, 4, delta);
      this.rightArmGroup.position.y = THREE.MathUtils.damp(this.rightArmGroup.position.y, 0.4, 4, delta);
      return;
    }

    // Spring physics integration for head recoil
    const stiffness = 85;
    const damping = 11;

    // Position springs
    this.headRecoil.vx += (-this.headRecoil.x * stiffness - this.headRecoil.vx * damping) * delta;
    this.headRecoil.vy += (-this.headRecoil.y * stiffness - this.headRecoil.vy * damping) * delta;
    this.headRecoil.vz += (-this.headRecoil.z * stiffness - this.headRecoil.vz * damping) * delta;
    this.headRecoil.x += this.headRecoil.vx * delta;
    this.headRecoil.y += this.headRecoil.vy * delta;
    this.headRecoil.z += this.headRecoil.vz * delta;

    // Rotation springs
    this.headRecoil.vrx += (-this.headRecoil.rx * stiffness - this.headRecoil.vrx * damping) * delta;
    this.headRecoil.vry += (-this.headRecoil.ry * stiffness - this.headRecoil.vry * damping) * delta;
    this.headRecoil.vrz += (-this.headRecoil.rz * stiffness - this.headRecoil.vrz * damping) * delta;
    this.headRecoil.rx += this.headRecoil.vrx * delta;
    this.headRecoil.ry += this.headRecoil.vry * delta;
    this.headRecoil.rz += this.headRecoil.vrz * delta;

    // Apply breathing & boxing bounce
    const bounceY = Math.sin(time * 6) * 0.035;
    const swayX = Math.cos(time * 3) * 0.04;

    this.opponentGroup.position.set(swayX, bounceY, -0.65);
    this.opponentGroup.rotation.set(0, 0, 0);

    // Apply head recoil + base position
    _targetHeadPos.set(this.headRecoil.x, 1.62 + this.headRecoil.y, 0.02 + this.headRecoil.z);
    this.opponentHeadGroup.position.copy(_targetHeadPos);

    _targetHeadRot.set(this.headRecoil.rx, this.headRecoil.ry, this.headRecoil.rz);
    this.opponentHeadGroup.rotation.copy(_targetHeadRot);

    // Guard arms vs punching animation
    if (this.opponentPunching.active) {
      this.opponentPunching.progress += delta * 4.5;
      const p = this.opponentPunching.progress;
      const punchReach = Math.sin(Math.min(p, 1) * Math.PI) * 0.75;

      if (this.opponentPunching.arm === 'left') {
        this.leftArmGroup.position.set(-0.25, 1.45, punchReach);
        this.rightArmGroup.position.set(0.32, 1.48, 0.15); // Tight guard
      } else {
        this.rightArmGroup.position.set(0.25, 1.45, punchReach);
        this.leftArmGroup.position.set(-0.32, 1.48, 0.15);
      }

      if (p >= 1) {
        this.opponentPunching.active = false;
        this.opponentPunching.progress = 0;
      }
    } else {
      // Resting defense / blocking
      const blockHeight = this.opponentBlocking ? 0.2 : 0;
      const blockCover = this.opponentBlocking ? 0.12 : 0;

      const leftRestX = -0.32 + blockCover;
      const rightRestX = 0.32 - blockCover;
      const restY = 1.38 + blockHeight + Math.sin(time * 6 + 0.5) * 0.02;

      this.leftArmGroup.position.set(leftRestX, restY, 0.2);
      this.rightArmGroup.position.set(rightRestX, restY, 0.2);
    }
  }

  private updatePlayerGloveKinematics(delta: number) {
    const isGuarding = this.playerDodgeState === 'block';

    // Base resting positions
    let targetLeftX = -0.28;
    let targetRightX = 0.28;
    let targetLeftY = isGuarding ? 1.54 : 1.34;
    let targetRightY = isGuarding ? 1.54 : 1.34;
    let targetLeftZ = isGuarding ? 0.55 : 0.7;
    let targetRightZ = isGuarding ? 0.55 : 0.7;

    // Check punch progress
    if (this.playerPunchState.progress < 1) {
      this.playerPunchState.progress += delta * 6.5; // Fast punch animation
      const prog = Math.min(this.playerPunchState.progress, 1);
      // Sine trajectory out and back
      const extension = Math.sin(prog * Math.PI);

      const reachZ = -0.45 * extension; // Punch toward opponent at z=-0.65
      const reachY = this.playerPunchState.type === 'uppercut' ? 0.35 * extension : 0.1 * extension;
      const reachX = this.playerPunchState.type === 'left_hook' ? 0.22 * extension : this.playerPunchState.type === 'right_hook' ? -0.22 * extension : 0;

      if (this.playerPunchState.arm === 'left') {
        targetLeftZ += reachZ;
        targetLeftY += reachY;
        targetLeftX += reachX;
      } else {
        targetRightZ += reachZ;
        targetRightY += reachY;
        targetRightX += reachX;
      }
    }

    // Smoothly damp player gloves to target
    this.playerLeftGlove.position.x = THREE.MathUtils.damp(this.playerLeftGlove.position.x, targetLeftX, 18, delta);
    this.playerLeftGlove.position.y = THREE.MathUtils.damp(this.playerLeftGlove.position.y, targetLeftY, 18, delta);
    this.playerLeftGlove.position.z = THREE.MathUtils.damp(this.playerLeftGlove.position.z, targetLeftZ, 18, delta);

    this.playerRightGlove.position.x = THREE.MathUtils.damp(this.playerRightGlove.position.x, targetRightX, 18, delta);
    this.playerRightGlove.position.y = THREE.MathUtils.damp(this.playerRightGlove.position.y, targetRightY, 18, delta);
    this.playerRightGlove.position.z = THREE.MathUtils.damp(this.playerRightGlove.position.z, targetRightZ, 18, delta);
  }

  private updateCamera(delta: number) {
    let slipX = 0;
    let slipRotZ = 0;

    if (this.playerDodgeState === 'slip_left') {
      slipX = -0.32;
      slipRotZ = 0.08;
    } else if (this.playerDodgeState === 'slip_right') {
      slipX = 0.32;
      slipRotZ = -0.08;
    }

    // Camera shake decay
    if (this.cameraShake.decay > 0) {
      this.cameraShake.decay -= delta;
      this.cameraShake.x *= 0.88;
      this.cameraShake.y *= 0.88;
    } else {
      this.cameraShake.x = 0;
      this.cameraShake.y = 0;
    }

    _targetCamPos.set(slipX + this.cameraShake.x, 1.62 + this.cameraShake.y, 1.35);
    this.camera.position.lerp(_targetCamPos, delta * 12);
    this.camera.rotation.z = THREE.MathUtils.damp(this.camera.rotation.z, slipRotZ, 12, delta);
  }

  private updateParticles(delta: number) {
    let activeCount = 0;
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.particleLife[i] > 0) {
        this.particleLife[i] -= delta;
        this.particlePositions[i * 3] += this.particleVelocities[i * 3] * delta;
        this.particlePositions[i * 3 + 1] += this.particleVelocities[i * 3 + 1] * delta;
        this.particlePositions[i * 3 + 2] += this.particleVelocities[i * 3 + 2] * delta;
        // Gravity
        this.particleVelocities[i * 3 + 1] -= 5.0 * delta;
        activeCount++;
      } else {
        this.particlePositions[i * 3 + 1] = -100;
      }
    }
    if (activeCount > 0) {
      this.particleGeo.attributes.position.needsUpdate = true;
    }
  }

  public dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.onWindowResize);
    this.renderer.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
