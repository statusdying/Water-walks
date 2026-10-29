import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  getPathCenterX,
  getTerrainHeight,
  SPRING_WATER_LEVEL,
  WORLD_LOCATIONS,
  WORLD_PROPS,
} from '../../shared/world';

interface WorldEnvironmentProps {
  wellFillRatio: number; // 0..1
}

export const WorldEnvironment: React.FC<WorldEnvironmentProps> = ({ wellFillRatio }) => {
  const waterMeshRef = useRef<THREE.Mesh>(null);

  // 1. Procedural Vertex-Colored Flat-Shaded Low-Poly Terrain Geometry (Expanded 135m x 280m)
  const terrainGeometry = useMemo(() => {
    const width = 135;
    const depth = 280;
    const segX = 96;
    const segZ = 210;

    const geom = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geom.rotateX(-Math.PI / 2);

    const posAttr = geom.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = getTerrainHeight(vx, vz);
      posAttr.setXYZ(i, vx, vy, vz);
    }

    const nonIndexed = geom.toNonIndexed();
    nonIndexed.computeVertexNormals();

    const niPos = nonIndexed.attributes.position;
    const colors = new Float32Array(niPos.count * 3);

    const colPlazaStone = new THREE.Color('#9c9588');
    const colDirtPath = new THREE.Color('#b8946c');
    const colPathEdge = new THREE.Color('#9e885e');
    const colGrassLight = new THREE.Color('#7ca35b');
    const colGrassDeep = new THREE.Color('#5d8547');
    const colCreekSand = new THREE.Color('#c9b386');
    const colCreekBed = new THREE.Color('#526b5c');

    for (let i = 0; i < niPos.count; i += 3) {
      const cx = (niPos.getX(i) + niPos.getX(i + 1) + niPos.getX(i + 2)) / 3;
      const cy = (niPos.getY(i) + niPos.getY(i + 1) + niPos.getY(i + 2)) / 3;
      const cz = (niPos.getZ(i) + niPos.getZ(i + 1) + niPos.getZ(i + 2)) / 3;

      const distWell = Math.hypot(cx - WORLD_LOCATIONS.WELL.x, cz - WORLD_LOCATIONS.WELL.z);
      const pathX = getPathCenterX(cz);
      const distPath = Math.abs(cx - pathX);
      const creekCenterZ = 112.0 + Math.sin(cx * 0.1) * 1.8;
      const distCreek = Math.abs(cz - creekCenterZ);

      const faceColor = new THREE.Color();
      const facetJitter = ((Math.sin(cx * 12.7 + cz * 7.3) * 0.5 + 0.5) - 0.5) * 0.04;

      if (distWell < 8.5) {
        faceColor.copy(colPlazaStone);
      } else if (cz > 99 && distCreek < 4.5 && Math.abs(cx) < 24) {
        faceColor.copy(cy < 0.02 ? colCreekBed : colCreekSand);
      } else if (cz > 99 && distCreek < 6.8 && Math.abs(cx) < 24) {
        faceColor.copy(colCreekSand);
      } else if (cz >= -112 && cz <= 108 && distPath < 2.8) {
        faceColor.copy(colDirtPath);
      } else if (cz >= -113 && cz <= 108 && distPath < 4.0) {
        faceColor.copy(colPathEdge);
      } else {
        const grassMix = Math.sin(cx * 0.14) * Math.cos(cz * 0.11) * 0.5 + 0.5;
        faceColor.lerpColors(colGrassDeep, colGrassLight, grassMix);
      }

      faceColor.offsetHSL(0, 0, facetJitter);

      for (let v = 0; v < 3; v++) {
        colors[(i + v) * 3] = faceColor.r;
        colors[(i + v) * 3 + 1] = faceColor.g;
        colors[(i + v) * 3 + 2] = faceColor.b;
      }
    }

    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return nonIndexed;
  }, []);

  // 2. Procedural Translucent Flat-Faceted Creek Water Geometry
  const creekWaterGeometry = useMemo(() => {
    const geom = new THREE.PlaneGeometry(48, 12.5, 36, 12);
    geom.rotateX(-Math.PI / 2);
    return geom.toNonIndexed();
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (waterMeshRef.current) {
      const geom = waterMeshRef.current.geometry;
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const wave =
          Math.sin(x * 0.65 + t * 2.1) * 0.05 +
          Math.cos(z * 1.1 - t * 1.7) * 0.038;
        pos.setY(i, wave);
      }
      pos.needsUpdate = true;
      geom.computeVertexNormals();
    }
  });

  // 3. Irregular Flat-Shaded Cobblestones for the Massive Hilltop Well
  const wellCobblestones = useMemo(() => {
    const stones: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      rotY: number;
      rotX: number;
      color: string;
    }> = [];

    const ringCount = 5;
    const stonesPerRing = 18;
    const wellRadius = 2.45;
    const palette = ['#7d776f', '#6b655e', '#8c857b', '#5e5952', '#948b80'];

    for (let r = 0; r < ringCount; r++) {
      const y = 0.22 + r * 0.36;
      const angleOffset = (r % 2) * (Math.PI / stonesPerRing);
      for (let s = 0; s < stonesPerRing; s++) {
        const angle = (s / stonesPerRing) * Math.PI * 2 + angleOffset;
        const radJitter = ((s * 7 + r * 13) % 5 - 2) * 0.03;
        const radius = wellRadius + radJitter;
        stones.push({
          x: Math.cos(angle) * radius,
          y,
          z: Math.sin(angle) * radius,
          sx: 0.52 + ((s + r) % 3) * 0.08,
          sy: 0.38 + (s % 2) * 0.06,
          sz: 0.88 + ((s * 3) % 4) * 0.07,
          rotY: -angle,
          rotX: ((s % 3) - 1) * 0.06,
          color: palette[(s + r * 3) % palette.length],
        });
      }
    }
    return stones;
  }, []);

  const wellBaseY = getTerrainHeight(WORLD_LOCATIONS.WELL.x, WORLD_LOCATIONS.WELL.z);
  const merchantBaseY = getTerrainHeight(
    WORLD_LOCATIONS.MERCHANT.x,
    WORLD_LOCATIONS.MERCHANT.z
  );

  const treePalette = ['#3e6b48', '#4b7a51', '#355c3e', '#568556'];

  return (
    <group>
      {/* TERRAIN MESH */}
      <mesh geometry={terrainGeometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0.02} flatShading />
      </mesh>

      {/* HILLTOP HUB: MASSIVE COBBLESTONE WELL */}
      <group position={[WORLD_LOCATIONS.WELL.x, wellBaseY, WORLD_LOCATIONS.WELL.z]}>
        <mesh receiveShadow position={[0, 0.06, 0]}>
          <cylinderGeometry args={[3.6, 3.9, 0.14, 16]} />
          <meshStandardMaterial color="#857e74" roughness={0.95} flatShading />
        </mesh>

        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[2.18, 2.18, 1.5, 16, 1, true]} />
          <meshStandardMaterial
            color="#1c1917"
            roughness={1}
            side={THREE.BackSide}
            flatShading
          />
        </mesh>

        <mesh position={[0, 0.15 + wellFillRatio * 1.45, 0]}>
          <cylinderGeometry args={[2.15, 2.15, 0.1, 14]} />
          <meshStandardMaterial
            color="#3da5d9"
            emissive="#155d82"
            emissiveIntensity={0.35}
            roughness={0.2}
            flatShading
          />
        </mesh>

        {wellCobblestones.map((st, idx) => (
          <mesh
            key={idx}
            castShadow
            receiveShadow
            position={[st.x, st.y, st.z]}
            rotation={[st.rotX, st.rotY, 0]}
            scale={[st.sx, st.sy, st.sz]}
          >
            <dodecahedronGeometry args={[0.52, 0]} />
            <meshStandardMaterial color={st.color} roughness={0.9} flatShading />
          </mesh>
        ))}

        <mesh castShadow receiveShadow position={[-2.35, 2.4, 0]}>
          <boxGeometry args={[0.34, 3.2, 0.34]} />
          <meshStandardMaterial color="#5c3d28" roughness={0.88} flatShading />
        </mesh>
        <mesh castShadow receiveShadow position={[2.35, 2.4, 0]}>
          <boxGeometry args={[0.34, 3.2, 0.34]} />
          <meshStandardMaterial color="#5c3d28" roughness={0.88} flatShading />
        </mesh>

        <mesh castShadow position={[0, 2.85, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.16, 0.16, 4.7, 8]} />
          <meshStandardMaterial color="#734f36" roughness={0.85} flatShading />
        </mesh>
        <mesh castShadow position={[0, 2.85, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.24, 0.24, 0.65, 9]} />
          <meshStandardMaterial color="#c4a474" roughness={0.9} flatShading />
        </mesh>

        <mesh castShadow receiveShadow position={[0, 4.35, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[3.65, 1.85, 4]} />
          <meshStandardMaterial color="#6e432c" roughness={0.85} flatShading />
        </mesh>

        <mesh position={[0, 3.35, 1.2]}>
          <octahedronGeometry args={[0.2, 0]} />
          <meshStandardMaterial
            color="#ffdf78"
            emissive="#ff9d2e"
            emissiveIntensity={1.6}
            flatShading
          />
        </mesh>
        <pointLight position={[0, 3.2, 1.2]} color="#ffb85c" intensity={4} distance={14} />
      </group>

      {/* HILLTOP HUB: WOODEN MERCHANT CART / STALL FOR UPGRADES */}
      <group
        position={[WORLD_LOCATIONS.MERCHANT.x, merchantBaseY, WORLD_LOCATIONS.MERCHANT.z]}
        rotation={[0, -0.55, 0]}
      >
        <mesh castShadow receiveShadow position={[0, 0.85, 0]}>
          <boxGeometry args={[3.6, 0.35, 2.2]} />
          <meshStandardMaterial color="#784f33" roughness={0.86} flatShading />
        </mesh>

        {[-1.2, 1.2].map((wx, i) =>
          [-1.15, 1.15].map((wz, j) => (
            <mesh
              key={`wheel-${i}-${j}`}
              castShadow
              receiveShadow
              position={[wx, 0.55, wz]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.55, 0.55, 0.16, 10]} />
              <meshStandardMaterial color="#4f3320" roughness={0.9} flatShading />
            </mesh>
          ))
        )}

        {[
          [-1.6, -0.95],
          [1.6, -0.95],
          [-1.6, 0.95],
          [1.6, 0.95],
        ].map(([px, pz], idx) => (
          <mesh key={`pole-${idx}`} castShadow position={[px, 1.95, pz]}>
            <cylinderGeometry args={[0.08, 0.08, 2.2, 6]} />
            <meshStandardMaterial color="#5c3d28" roughness={0.88} flatShading />
          </mesh>
        ))}

        <mesh castShadow receiveShadow position={[0, 3.15, 0]} rotation={[0.12, 0, 0]}>
          <boxGeometry args={[4.0, 0.22, 2.7]} />
          <meshStandardMaterial color="#d46b4a" roughness={0.8} flatShading />
        </mesh>
        <mesh castShadow position={[0, 3.22, 0]} rotation={[0.12, 0, 0]}>
          <boxGeometry args={[1.4, 0.24, 2.74]} />
          <meshStandardMaterial color="#f0e4ce" roughness={0.8} flatShading />
        </mesh>

        <mesh castShadow position={[-1.0, 1.22, 0.35]}>
          <cylinderGeometry args={[0.24, 0.18, 0.42, 8]} />
          <meshStandardMaterial color="#c86446" roughness={0.82} flatShading />
        </mesh>
        <mesh castShadow position={[0, 1.28, 0.35]}>
          <cylinderGeometry args={[0.28, 0.24, 0.52, 9]} />
          <meshStandardMaterial color="#434852" metalness={0.6} roughness={0.4} flatShading />
        </mesh>
        <mesh castShadow position={[1.0, 1.32, 0.35]}>
          <cylinderGeometry args={[0.38, 0.2, 0.55, 9]} />
          <meshStandardMaterial color="#d98a3c" metalness={0.55} roughness={0.35} flatShading />
        </mesh>

        <group position={[0, 1.0, -0.55]}>
          <mesh castShadow position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.26, 0.32, 0.7, 7]} />
            <meshStandardMaterial color="#7a4968" roughness={0.85} flatShading />
          </mesh>
          <mesh castShadow position={[0, 0.88, 0]}>
            <icosahedronGeometry args={[0.22, 1]} />
            <meshStandardMaterial color="#ebc3a4" roughness={0.8} flatShading />
          </mesh>
          <mesh castShadow position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.28, 0.32, 0.22, 8]} />
            <meshStandardMaterial color="#d9a74a" roughness={0.85} flatShading />
          </mesh>
        </group>

        <pointLight position={[0, 2.6, 1.1]} color="#ffbe6b" intensity={3.5} distance={10} />
      </group>

      {/* THE SPRING (VALLEY CREEK AT z = 112.0) */}
      <group position={[0, SPRING_WATER_LEVEL, 112.0]}>
        <mesh ref={waterMeshRef} geometry={creekWaterGeometry} receiveShadow>
          <meshStandardMaterial
            color="#4fc3e8"
            emissive="#1b6987"
            emissiveIntensity={0.22}
            transparent
            opacity={0.76}
            roughness={0.18}
            metalness={0.1}
            flatShading
          />
        </mesh>

        {[-18, -15.5, 16, 18.5].map((rx, i) => (
          <mesh
            key={`creek-rock-${i}`}
            castShadow
            receiveShadow
            position={[rx, 0.4, (i % 2 - 0.5) * 3.5]}
          >
            <dodecahedronGeometry args={[1.45, 0]} />
            <meshStandardMaterial color="#6e7872" roughness={0.88} flatShading />
          </mesh>
        ))}

        {[-12, -8.5, -5, 5.5, 9.5, 13].map((rx, idx) => (
          <group key={`reed-${idx}`} position={[rx, 0.1, idx % 2 === 0 ? -5.0 : 5.0]}>
            <mesh castShadow position={[0, 0.55, 0]} rotation={[0, 0, 0.08]}>
              <cylinderGeometry args={[0.03, 0.04, 1.1, 5]} />
              <meshStandardMaterial color="#4e783f" roughness={0.85} flatShading />
            </mesh>
            <mesh castShadow position={[0.03, 0.95, 0]} rotation={[0, 0, 0.08]}>
              <cylinderGeometry args={[0.065, 0.065, 0.28, 6]} />
              <meshStandardMaterial color="#593822" roughness={0.9} flatShading />
            </mesh>
          </group>
        ))}
      </group>

      {/* FOREST PATH: LOW-POLY PINE TREES & BOULDERS */}
      {WORLD_PROPS.trees.map((t) => (
        <group
          key={`tree-${t.id}`}
          position={[t.x, t.y, t.z]}
          rotation={[0, t.rotY, 0]}
          scale={t.scale}
        >
          <mesh castShadow receiveShadow position={[0, 0.75, 0]}>
            <cylinderGeometry args={[0.22, 0.34, 1.6, 6]} />
            <meshStandardMaterial color="#694832" roughness={0.92} flatShading />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 2.1, 0]}>
            <coneGeometry args={[1.55, 2.2, 7]} />
            <meshStandardMaterial
              color={treePalette[t.tintIndex]}
              roughness={0.86}
              flatShading
            />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 3.35, 0]}>
            <coneGeometry args={[1.22, 1.95, 7]} />
            <meshStandardMaterial
              color={treePalette[(t.tintIndex + 1) % treePalette.length]}
              roughness={0.86}
              flatShading
            />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 4.45, 0]}>
            <coneGeometry args={[0.82, 1.55, 7]} />
            <meshStandardMaterial
              color={treePalette[t.tintIndex]}
              roughness={0.86}
              flatShading
            />
          </mesh>
        </group>
      ))}

      {WORLD_PROPS.rocks.map((r) => (
        <mesh
          key={`rock-${r.id}`}
          castShadow
          receiveShadow
          position={[r.x, r.y + r.scaleY * 0.4, r.z]}
          rotation={[r.rotX, r.rotY, r.rotZ]}
          scale={[r.scaleX, r.scaleY, r.scaleZ]}
        >
          <dodecahedronGeometry args={[0.85, 0]} />
          <meshStandardMaterial color="#878278" roughness={0.9} flatShading />
        </mesh>
      ))}

      {/* Wooden Guideposts & Lanterns Along the Expanded Winding Trail */}
      {[-75, -45, -15, 15, 45, 75].map((zPos, idx) => {
        const px = getPathCenterX(zPos) + (idx % 2 === 0 ? 4.2 : -4.2);
        const py = getTerrainHeight(px, zPos);
        return (
          <group key={`post-${idx}`} position={[px, py, zPos]}>
            <mesh castShadow position={[0, 1.0, 0]}>
              <cylinderGeometry args={[0.09, 0.11, 2.0, 6]} />
              <meshStandardMaterial color="#63422b" roughness={0.9} flatShading />
            </mesh>
            <mesh castShadow position={[0, 1.8, 0]} rotation={[0, 0.4, 0]}>
              <boxGeometry args={[0.9, 0.26, 0.08]} />
              <meshStandardMaterial color="#a67b51" roughness={0.85} flatShading />
            </mesh>
            <mesh position={[0, 2.05, 0]}>
              <octahedronGeometry args={[0.14, 0]} />
              <meshStandardMaterial
                color="#ffdf78"
                emissive="#ff9d2e"
                emissiveIntensity={1.2}
                flatShading
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
};
