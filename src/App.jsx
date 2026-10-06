import { useEffect } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import Scene from './scene/Scene.jsx'
import ContentDeck from './ui/ContentDeck.jsx'
import { scroll } from './lib/anchors.js'
import { FLIGHT } from './config.js'

// Mirrors data/meetup.json in the real repo. The date is in the past, so the
// site renders the TBA state -- that is the LIVE state, not a hypothetical.
const NEXT_MEETUP = {
  date: '2026-07-28',
  url: 'https://www.meetup.com/cville-tech/events/315584929/',
}
const GROUP_URL = 'https://www.meetup.com/cville-tech/'
const isUpcoming = new Date(`${NEXT_MEETUP.date}T23:59:59`) >= new Date()
const meetupLabel = isUpcoming
  ? new Date(`${NEXT_MEETUP.date}T12:00:00`).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  : 'TBA: Check Meetup Page'

export default function App() {
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      scroll.y = window.scrollY
      scroll.max = max
      scroll.p = max > 0 ? window.scrollY / max : 0
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <>
      <Canvas
        className="canvas"
        dpr={[1, 2]}
        // ACES keeps the cream highlights from clipping as the ripples catch
        // the key light; the exposure lift is what stops the artwork's navy
        // bands -- almost black in linear space -- reading as holes.
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.55,
        }}
        camera={{
          fov: 50,
          near: 0.5,
          far: 900,
          position: [0, FLIGHT.startY, FLIGHT.startZ],
        }}
      >
        <Scene />
      </Canvas>

      <ContentDeck />

      <main className="flow">
        <section className="flow__hero">
          <h1>Cville AI Explorers</h1>
          <p>Building with AI in Charlottesville, Virginia</p>
          <p className="flow__meetup">
            <span className="flow__meetup-label">Next Meetup</span>
            <a href={isUpcoming ? NEXT_MEETUP.url : GROUP_URL}>{meetupLabel}</a>
            <span className="flow__meetup-where">
              Monthly at Studio IX &mdash; 969 2nd St SE, Charlottesville
            </span>
          </p>
          <span className="flow__cue" aria-hidden="true">
            scroll
          </span>
        </section>

        {/* One spacer per stretch of the flight: the dive, then each panel. */}
        <section className="flow__spacer" aria-hidden="true" />
        <section className="flow__spacer" aria-hidden="true" />
        <section className="flow__spacer" aria-hidden="true" />
        <section className="flow__spacer" aria-hidden="true" />
        <section className="flow__spacer" aria-hidden="true" />

        <footer className="flow__footer">
          <p className="flow__sponsor">
            Sponsored by <a href="https://www.studioix.co/">Studio IX</a>
          </p>
          <p>
            Operating under the{' '}
            <a href={GROUP_URL}>Charlottesville Technologists meetup</a>.{' '}
            <a href="https://github.com/cvilleaiexplorers">GitHub</a>.
          </p>
          <p>
            Contact organizers in{' '}
            <a href="https://cville.slack.com/archives/C08DTL1TS1K">
              #cvilleaiexplorers
            </a>{' '}
            on <a href="https://cville.slack.com">Cville Slack</a>. We follow the{' '}
            <a href="https://github.com/cville/conduct">
              Cville Slack Code of Conduct
            </a>
            .
          </p>
          <p className="flow__fine">
            Elevation data courtesy of the{' '}
            <a href="https://www.usgs.gov/3d-elevation-program">
              U.S. Geological Survey, 3D Elevation Program
            </a>
            . Buildings and roads &copy;{' '}
            <a href="https://opendata.charlottesville.org/">
              City of Charlottesville
            </a>
            , <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
          </p>
          <p className="flow__fine">&copy; 2026 Cville AI Explorers.</p>
        </footer>
      </main>
    </>
  )
}
