import { ContactShadows, Float, RoundedBox, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { MutableRefObject, useMemo, useRef } from "react";
import type { Group } from "three";
import * as THREE from "three";

type ChessSceneProps = {
  scrollProgress: MutableRefObject<number>;
};

type PieceKind = "pawn" | "rook" | "bishop" | "queen" | "king";

type ChessPieceProps = {
  kind: PieceKind;
  position: [number, number, number];
  dark?: boolean;
  rotation?: [number, number, number];
  scale?: number;
};

const lightMaterial = {
  color: "#dce7dd",
  metalness: 0.55,
  roughness: 0.2,
};

const darkMaterial = {
  color: "#12231c",
  metalness: 0.68,
  roughness: 0.18,
};

function PieceMaterial({ dark = false }: { dark?: boolean }) {
  return (
    <meshStandardMaterial
      {...(dark ? darkMaterial : lightMaterial)}
      envMapIntensity={1.4}
    />
  );
}

function PieceBase({ dark = false }: { dark?: boolean }) {
  return (
    <>
      <mesh castShadow position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.36, 0.43, 0.18, 32]} />
        <PieceMaterial dark={dark} />
      </mesh>
      <mesh castShadow position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.3, 0.35, 0.12, 32]} />
        <PieceMaterial dark={dark} />
      </mesh>
    </>
  );
}

function ChessPiece({
  kind,
  position,
  dark = false,
  rotation = [0, 0, 0],
  scale = 1,
}: ChessPieceProps) {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      <PieceBase dark={dark} />

      {kind === "pawn" && (
        <>
          <mesh castShadow position={[0, 0.49, 0]}>
            <cylinderGeometry args={[0.18, 0.27, 0.42, 28]} />
            <PieceMaterial dark={dark} />
          </mesh>
          <mesh castShadow position={[0, 0.82, 0]}>
            <sphereGeometry args={[0.22, 28, 28]} />
            <PieceMaterial dark={dark} />
          </mesh>
        </>
      )}

      {kind === "rook" && (
        <>
          <mesh castShadow position={[0, 0.62, 0]}>
            <cylinderGeometry args={[0.25, 0.29, 0.7, 32]} />
            <PieceMaterial dark={dark} />
          </mesh>
          <mesh castShadow position={[0, 1.02, 0]}>
            <cylinderGeometry args={[0.38, 0.3, 0.2, 8]} />
            <PieceMaterial dark={dark} />
          </mesh>
          {[-0.25, 0, 0.25].map((x) => (
            <mesh key={x} castShadow position={[x, 1.16, 0]}>
              <boxGeometry args={[0.13, 0.2, 0.48]} />
              <PieceMaterial dark={dark} />
            </mesh>
          ))}
        </>
      )}

      {kind === "bishop" && (
        <>
          <mesh castShadow position={[0, 0.67, 0]}>
            <cylinderGeometry args={[0.17, 0.29, 0.8, 32]} />
            <PieceMaterial dark={dark} />
          </mesh>
          <mesh castShadow position={[0, 1.12, 0]} scale={[0.78, 1.25, 0.78]}>
            <sphereGeometry args={[0.25, 32, 32]} />
            <PieceMaterial dark={dark} />
          </mesh>
          <mesh castShadow position={[0, 1.43, 0]}>
            <sphereGeometry args={[0.075, 20, 20]} />
            <PieceMaterial dark={dark} />
          </mesh>
        </>
      )}

      {kind === "queen" && (
        <>
          <mesh castShadow position={[0, 0.72, 0]}>
            <cylinderGeometry args={[0.2, 0.32, 0.92, 36]} />
            <PieceMaterial dark={dark} />
          </mesh>
          <mesh castShadow position={[0, 1.15, 0]}>
            <torusGeometry args={[0.29, 0.07, 16, 36]} />
            <PieceMaterial dark={dark} />
          </mesh>
          {[0, 1, 2, 3, 4].map((index) => {
            const angle = (index / 5) * Math.PI * 2;
            return (
              <mesh
                key={index}
                castShadow
                position={[
                  Math.cos(angle) * 0.25,
                  1.42,
                  Math.sin(angle) * 0.25,
                ]}
              >
                <sphereGeometry args={[0.085, 18, 18]} />
                <PieceMaterial dark={dark} />
              </mesh>
            );
          })}
          <mesh castShadow position={[0, 1.38, 0]}>
            <coneGeometry args={[0.3, 0.38, 5]} />
            <PieceMaterial dark={dark} />
          </mesh>
        </>
      )}

      {kind === "king" && (
        <>
          <mesh castShadow position={[0, 0.74, 0]}>
            <cylinderGeometry args={[0.21, 0.33, 0.95, 36]} />
            <PieceMaterial dark={dark} />
          </mesh>
          <mesh castShadow position={[0, 1.2, 0]}>
            <torusGeometry args={[0.28, 0.065, 16, 36]} />
            <PieceMaterial dark={dark} />
          </mesh>
          <mesh castShadow position={[0, 1.45, 0]}>
            <boxGeometry args={[0.13, 0.5, 0.13]} />
            <PieceMaterial dark={dark} />
          </mesh>
          <mesh castShadow position={[0, 1.53, 0]}>
            <boxGeometry args={[0.4, 0.12, 0.13]} />
            <PieceMaterial dark={dark} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Board({ scrollProgress }: ChessSceneProps) {
  const boardRef = useRef<Group>(null);
  const squares = useMemo(
    () =>
      Array.from({ length: 64 }, (_, index) => {
        const file = index % 8;
        const rank = Math.floor(index / 8);
        return {
          key: `${file}-${rank}`,
          position: [file - 3.5, 0, rank - 3.5] as [number, number, number],
          light: (file + rank) % 2 === 0,
        };
      }),
    []
  );

  useFrame((state, delta) => {
    if (!boardRef.current) return;

    const progress = scrollProgress.current;
    const targetY = -0.42 + progress * Math.PI * 1.2 + state.pointer.x * 0.12;
    const targetX = state.pointer.y * 0.08 + progress * 0.16;

    boardRef.current.rotation.y = THREE.MathUtils.damp(
      boardRef.current.rotation.y,
      targetY,
      4,
      delta
    );
    boardRef.current.rotation.x = THREE.MathUtils.damp(
      boardRef.current.rotation.x,
      targetX,
      4,
      delta
    );
    boardRef.current.position.y = THREE.MathUtils.damp(
      boardRef.current.position.y,
      -0.35 + Math.sin(state.clock.elapsedTime * 0.55) * 0.06,
      3,
      delta
    );
  });

  return (
    <group ref={boardRef} rotation={[0, -0.42, 0]}>
      <RoundedBox
        args={[8.75, 0.34, 8.75]}
        radius={0.13}
        smoothness={5}
        position={[0, -0.26, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#07110d"
          metalness={0.72}
          roughness={0.28}
        />
      </RoundedBox>

      {squares.map((square) => (
        <RoundedBox
          key={square.key}
          args={[0.97, 0.12, 0.97]}
          radius={0.035}
          smoothness={3}
          position={square.position}
          receiveShadow
        >
          <meshStandardMaterial
            color={square.light ? "#aab7aa" : "#174934"}
            metalness={square.light ? 0.12 : 0.25}
            roughness={square.light ? 0.5 : 0.38}
          />
        </RoundedBox>
      ))}

      <ChessPiece kind="king" position={[0.5, 0.08, 2.5]} />
      <ChessPiece kind="queen" position={[-0.5, 0.08, 2.5]} />
      <ChessPiece kind="bishop" position={[-1.5, 0.08, 1.5]} />
      <ChessPiece kind="rook" position={[3.5, 0.08, 3.5]} />
      <ChessPiece kind="pawn" position={[0.5, 0.08, 1.5]} />
      <ChessPiece kind="pawn" position={[-2.5, 0.08, 0.5]} dark />
      <ChessPiece kind="queen" position={[1.5, 0.08, -1.5]} dark />
      <ChessPiece kind="rook" position={[-3.5, 0.08, -2.5]} dark />
      <ChessPiece kind="bishop" position={[2.5, 0.08, -2.5]} dark />
      <ChessPiece kind="pawn" position={[-0.5, 0.08, -1.5]} dark />
    </group>
  );
}

function Scene({ scrollProgress }: ChessSceneProps) {
  return (
    <>
      <color attach="background" args={["#040806"]} />
      <fog attach="fog" args={["#040806", 13, 25]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        color="#e8fff0"
        intensity={2.4}
        position={[4, 9, 5]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight
        color="#34f58b"
        intensity={55}
        distance={14}
        position={[-5, 2, 3]}
      />
      <spotLight
        color="#5dff9e"
        intensity={100}
        angle={0.5}
        penumbra={0.9}
        position={[5, 6, -4]}
      />

      <Float speed={1.1} rotationIntensity={0.05} floatIntensity={0.15}>
        <Board scrollProgress={scrollProgress} />
      </Float>
      <ContactShadows
        position={[0, -0.75, 0]}
        opacity={0.62}
        scale={15}
        blur={2.6}
        far={5}
        color="#06120c"
      />
      <Sparkles
        count={36}
        scale={[11, 7, 11]}
        size={1.3}
        speed={0.22}
        opacity={0.45}
        color="#67ffa9"
      />
    </>
  );
}

export default function ChessScene({ scrollProgress }: ChessSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [7.8, 7.2, 9.6], fov: 42 }}
      gl={{ antialias: true, alpha: false }}
      shadows
    >
      <Scene scrollProgress={scrollProgress} />
    </Canvas>
  );
}
