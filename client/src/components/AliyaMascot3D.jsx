import { useEffect, useRef } from 'react'
import * as THREE from 'three'

function makeTextSprite(text, {
  width = 512,
  height = 180,
  font = '700 64px Inter, Arial, sans-serif',
  color = '#140206',
  background = 'rgba(251, 248, 241, 0.70)',
  border = 'rgba(20, 2, 6, 0.16)',
} = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = background
  ctx.strokeStyle = border
  ctx.lineWidth = 4
  const radius = 42
  ctx.beginPath()
  ctx.moveTo(radius, 2)
  ctx.lineTo(width - radius, 2)
  ctx.quadraticCurveTo(width - 2, 2, width - 2, radius)
  ctx.lineTo(width - 2, height - radius)
  ctx.quadraticCurveTo(width - 2, height - 2, width - radius, height - 2)
  ctx.lineTo(radius, height - 2)
  ctx.quadraticCurveTo(2, height - 2, 2, height - radius)
  ctx.lineTo(2, radius)
  ctx.quadraticCurveTo(2, 2, radius, 2)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = color
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, width / 2, height / 2 + 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  sprite.userData.dispose = () => {
    texture.dispose()
    material.dispose()
  }
  return sprite
}

function createCapsule(radius, length, material) {
  const geometry = new THREE.CapsuleGeometry(radius, length, 8, 24)
  return new THREE.Mesh(geometry, material)
}

export function AliyaMascot3D() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
    camera.position.set(0, 0.18, 5.1)

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const robot = new THREE.Group()
    robot.position.set(0, -0.16, 0)
    scene.add(robot)

    const shell = new THREE.MeshPhysicalMaterial({
      color: 0xe8eef2,
      roughness: 0.42,
      metalness: 0.18,
      clearcoat: 0.24,
      clearcoatRoughness: 0.35,
    })
    const softBlue = new THREE.MeshPhysicalMaterial({
      color: 0x8edcf3,
      roughness: 0.35,
      metalness: 0.12,
      emissive: 0x10242c,
      emissiveIntensity: 0.35,
    })
    const dark = new THREE.MeshStandardMaterial({ color: 0x101217, roughness: 0.62, metalness: 0.16 })
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xbdf4ff, emissive: 0x63d8f4, emissiveIntensity: 1.6 })
    const blushMat = new THREE.MeshStandardMaterial({ color: 0xff9fb5, emissive: 0x7a2638, emissiveIntensity: 0.3 })
    const jointMat = new THREE.MeshStandardMaterial({ color: 0x5f6874, roughness: 0.55, metalness: 0.3 })

    const body = createCapsule(0.48, 0.52, shell)
    body.scale.set(1.06, 1.1, 0.8)
    body.position.y = -0.14
    robot.add(body)

    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.34, 0.045), dark)
    belly.position.set(0, -0.07, 0.39)
    robot.add(belly)

    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), softBlue)
    heart.position.set(0.18, 0.02, 0.43)
    heart.scale.set(1, 0.82, 0.28)
    robot.add(heart)

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 40, 28), shell)
    head.scale.set(1.08, 0.82, 0.84)
    head.position.y = 0.86
    robot.add(head)

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.26, 0.045), dark)
    visor.position.set(0, 0.88, 0.53)
    robot.add(visor)

    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), eyeMat)
    leftEye.position.set(-0.19, 0.9, 0.58)
    leftEye.scale.z = 0.24
    robot.add(leftEye)

    const rightEye = leftEye.clone()
    rightEye.material = eyeMat
    rightEye.position.x = 0.19
    robot.add(rightEye)

    const leftBlush = new THREE.Mesh(new THREE.SphereGeometry(0.045, 18, 12), blushMat)
    leftBlush.position.set(-0.34, 0.78, 0.55)
    leftBlush.scale.set(1.2, 0.55, 0.18)
    robot.add(leftBlush)

    const rightBlush = leftBlush.clone()
    rightBlush.material = blushMat
    rightBlush.position.x = 0.34
    robot.add(rightBlush)

    const antennaStem = createCapsule(0.025, 0.22, jointMat)
    antennaStem.position.set(0, 1.44, 0)
    robot.add(antennaStem)

    const antennaDot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), softBlue)
    antennaDot.position.set(0, 1.59, 0)
    robot.add(antennaDot)

    const armGeometry = new THREE.CapsuleGeometry(0.075, 0.46, 8, 18)
    const handGeometry = new THREE.SphereGeometry(0.105, 24, 16)

    const leftArm = new THREE.Group()
    leftArm.position.set(-0.55, 0.22, 0)
    const leftArmMesh = new THREE.Mesh(armGeometry, shell)
    leftArmMesh.position.y = -0.24
    leftArmMesh.rotation.z = 0.18
    leftArm.add(leftArmMesh)
    const leftHand = new THREE.Mesh(handGeometry, shell)
    leftHand.position.set(-0.08, -0.52, 0)
    leftArm.add(leftHand)
    robot.add(leftArm)

    const waveArm = new THREE.Group()
    waveArm.position.set(0.55, 0.2, 0)
    const waveArmMesh = new THREE.Mesh(armGeometry, shell)
    waveArmMesh.position.y = 0.22
    waveArmMesh.rotation.z = -0.08
    waveArm.add(waveArmMesh)
    const waveHand = new THREE.Mesh(handGeometry, shell)
    waveHand.position.set(0.07, 0.5, 0)
    waveArm.add(waveHand)
    robot.add(waveArm)

    const leftFoot = createCapsule(0.095, 0.22, jointMat)
    leftFoot.rotation.z = Math.PI / 2
    leftFoot.position.set(-0.24, -0.83, 0.02)
    robot.add(leftFoot)

    const rightFoot = leftFoot.clone()
    rightFoot.material = jointMat
    rightFoot.position.x = 0.24
    robot.add(rightFoot)

    const hiSprite = makeTextSprite('Hi', {
      width: 260,
      height: 160,
      font: '800 82px Inter, Arial, sans-serif',
      color: '#140206',
      background: 'rgba(251,248,241,0.92)',
      border: 'rgba(20, 2, 6, 0.35)',
    })
    hiSprite.position.set(1.0, 1.28, 0.18)
    hiSprite.scale.set(0.54, 0.33, 1)
    robot.add(hiSprite)

    const nameSprite = makeTextSprite('Aliya AI', {
      width: 520,
      height: 150,
      font: '800 58px Inter, Arial, sans-serif',
      color: '#140206',
      background: 'rgba(251, 248, 241, 0.74)',
      border: 'rgba(142,220,243,0.22)',
    })
    nameSprite.position.set(0, -1.22, 0.2)
    nameSprite.scale.set(1.25, 0.36, 1)
    robot.add(nameSprite)

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.92, 56),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 }),
    )
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -1.05
    shadow.position.z = -0.04
    robot.add(shadow)

    scene.add(new THREE.AmbientLight(0xffffff, 1.45))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(2.4, 3.2, 4)
    scene.add(key)
    const rim = new THREE.PointLight(0x8edcf3, 2.8, 6)
    rim.position.set(-2, 1.8, 2.2)
    scene.add(rim)

    const pointer = { x: 0, y: 0 }
    const handlePointer = (event) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('pointermove', handlePointer, { passive: true })

    const resize = () => {
      const width = mount.clientWidth || 280
      const height = mount.clientHeight || 280
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    let frameId = 0
    const clock = new THREE.Clock()
    const animate = () => {
      const time = clock.getElapsedTime()
      const targetY = pointer.x * 0.28
      const targetX = -pointer.y * 0.16
      robot.rotation.y += (targetY - robot.rotation.y) * 0.055
      robot.rotation.x += (targetX - robot.rotation.x) * 0.055
      robot.position.y = -0.16 + Math.sin(time * 1.6) * 0.045

      head.rotation.y = Math.sin(time * 0.9) * 0.04
      waveArm.rotation.z = -1.18 + Math.sin(time * 4.2) * 0.28
      waveArm.rotation.x = Math.sin(time * 3.1) * 0.08

      const blinkPhase = time % 4.4
      const eyeScale = blinkPhase > 3.88 && blinkPhase < 4.08 ? 0.12 : 1
      leftEye.scale.y += (eyeScale - leftEye.scale.y) * 0.45
      rightEye.scale.y += (eyeScale - rightEye.scale.y) * 0.45
      antennaDot.position.y = 1.59 + Math.sin(time * 2.2) * 0.025
      hiSprite.material.opacity = 0.78 + Math.sin(time * 2.4) * 0.12

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }
    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('pointermove', handlePointer)
      resizeObserver.disconnect()
      mount.removeChild(renderer.domElement)
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose()
        if (object.material) {
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material.dispose()
        }
        object.userData?.dispose?.()
      })
      renderer.dispose()
    }
  }, [])

  return <div ref={mountRef} className="aliya-mascot-canvas" aria-hidden="true" />
}
