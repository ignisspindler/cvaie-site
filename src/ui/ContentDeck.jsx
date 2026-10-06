import { useEffect, useRef, useState } from 'react'
import { DECK_ANGLES, deckCards, deckChrome, entryOffset } from '../lib/deck.js'
import { BORDERS, loadBorder, nextBorder, saveBorder } from '../lib/borders.js'
import { DECK } from '../config.js'
import Overlay from './Overlay.jsx'
import meetups from '../data/meetups.json'

// The rest of the site's content, arriving as the flight crosses into
// Charlottesville. Everything here comes from context/content/.

const CARDS = [
  {
    id: 'mission',
    eyebrow: 'Our Mission',
    title: 'Build, share, learn',
    body: [
      'To foster a community where people develop AI building skills through ' +
      'hands-on projects, technical sharing and collaborative learning, and ' +
      'discover practical ways to integrate AI tools into their work and lives.',
    ],
    // The About Us list, which used to ride its own panel during the flight.
    list: [
      'Build practical AI applications and tools',
      'Share technical knowledge and implementation experiences',
      'Learn about and explore emerging AI technologies',
      'Support each other in creating AI-powered solutions',
    ],
  },
  {
    id: 'activities',
    eyebrow: 'What We Do',
    title: 'Activities and directions',
    list: [
      'Exploring modern AI platforms and workflow tools',
      'Technical demos and talks from AI builders',
      'Technical book discussions and learning circles',
      'Collaborative building sessions and group projects',
    ],
    action: { overlay: 'meetups', label: `All ${meetups.length} past meetups` },
  },
  {
    id: 'join',
    eyebrow: 'Join Us',
    title: "There's a place for you",
    body: [
      "Whether you're actively building AI applications or eager to learn how, " +
      "there's a place for you here. We emphasize practical skills and " +
      'implementation while keeping an inclusive environment for learning.',
    ],
    action: { href: 'https://www.meetup.com/cville-tech/', label: 'Join on Meetup' },
  },
  {
    id: 'involved',
    eyebrow: 'Get Involved',
    title: 'Five ways in',
    list: [
      'Attend our meetups',
      'Share your AI experiences',
      'Collaborate with other members',
      'Present your projects or findings',
      'Learn from peers',
    ],
    action: { overlay: 'sponsors', label: 'Our sponsor & partners' },
  },
]

function MeetupArchive() {
  return (
    <>
      <p className="overlay__lede">
        Every meetup since the group began, newest first. Organized by Owen
        Zanzal and Mike Powers under{' '}
        <a href="https://www.meetup.com/cville-tech/">Charlottesville Technologists</a>.
      </p>
      <p className="overlay__note">
        Each entry links to its Meetup event page. Recordings are not listed in
        the group&rsquo;s archive, so there are no video links to show yet.
      </p>
      <ol className="archive">
        {meetups.map((m) => (
          <li className="archive__item" key={m.heading}>
            <div className="archive__when">
              <time dateTime={m.date}>{m.dateLabel}</time>
              {m.note && <span className="archive__note">{m.note}</span>}
            </div>
            <div className="archive__what">
              <p className="archive__heading">{m.heading}</p>
              {m.title && <h3 className="archive__title">{m.title}</h3>}
              {m.speakers && <p className="archive__speakers">{m.speakers}</p>}
              <p className="archive__summary">{m.summary}</p>
              {m.link && <a className="archive__link" href={m.link}>Event page &rarr;</a>}
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

function Sponsors() {
  return (
    <>
      <p className="overlay__lede">
        Cville AI Explorers runs on borrowed rooms and local generosity.
      </p>

      <section className="sponsor">
        <img className="sponsor__logo" src="/studio-ix.jpg" alt="Studio IX" width="320" height="120" />
        <div>
          <p className="panel__eyebrow">Our sponsor</p>
          <h3 className="sponsor__name"><a href="https://www.studioix.co/">Studio IX</a></h3>
          <p className="panel__body">
            A coworking space in downtown Charlottesville for freelancers,
            entrepreneurs and remote workers: open workspaces, dedicated desks
            and private offices in a warm industrial room with plenty of
            natural light.
          </p>
          <p className="panel__body">
            Weekly events and mixers, high-speed internet, soundproof phone
            booths, conference rooms and premium coffee. Staffed weekdays;
            members have 24/7 access. Studio IX hosts our monthly meetups at
            969 2nd St SE.
          </p>
          <p className="panel__meta">
            Tours: <a href="mailto:COWORK@STUDIOIX.CO">COWORK@studioix.co</a>
            {' · '}<a href="tel:+14342603803">434.260.3803</a>
          </p>
        </div>
      </section>

      <h3 className="overlay__sub">Hosts and partners</h3>
      <div className="partners">
        <figure className="partner">
          <img src="/uva-data-science.jpg" alt="UVA School of Data Science" width="150" height="150" />
          <figcaption>
            <a href="https://datascience.virginia.edu/">UVA School of Data Science</a>
            {' '}&mdash; hosted our August 2026 joint event with Charlottesville
            Data Science at 1919 Ivy Road.
          </figcaption>
        </figure>
        <figure className="partner partner--text">
          <figcaption>
            <a href="https://www.meetup.com/cville-tech/">Charlottesville Technologists</a>
            {' '}&mdash; the meetup we operate under, where every one of our
            events is listed.
          </figcaption>
          <figcaption>
            S&amp;P Global sponsored pizza for the group&rsquo;s
            first-anniversary meetup in April 2026.
          </figcaption>
        </figure>
      </div>
    </>
  )
}

export default function ContentDeck() {
  const refs = useRef([])
  const [overlay, setOverlay] = useState(null)
  const [border, setBorder] = useState(BORDERS[0].id)

  // Read the saved choice after mount: localStorage is not available while
  // rendering and may throw outright in a private window.
  useEffect(() => { setBorder(loadBorder()) }, [])

  const chrome = useRef(null)
  useEffect(() => {
    refs.current.forEach((el, i) => { deckCards[i] = el })
    deckChrome.el = chrome.current
    return () => {
      deckCards.length = 0
      deckChrome.el = null
    }
  }, [])

  const shuffle = () => {
    const id = nextBorder(border)
    setBorder(id)
    saveBorder(id)
  }
  const label = BORDERS.find((b) => b.id === border)?.label ?? border

  return (
    <>
      <section className="deck" data-border={border} aria-label="About Cville AI Explorers">
        {CARDS.map((card, i) => {
          const { ox, oy, spin } = entryOffset(DECK_ANGLES[i % DECK_ANGLES.length], DECK.distance)
          return (
            <article
              key={card.id}
              className="deck__card"
              ref={(el) => { refs.current[i] = el }}
              style={{ '--ox': ox, '--oy': oy, '--spin': spin }}
            >
              <div className="deck__content">
                <p className="panel__eyebrow">{card.eyebrow}</p>
                <h2 className="deck__title">{card.title}</h2>
                {card.body?.map((text) => (
                  <p className="panel__body" key={text.slice(0, 24)}>{text}</p>
                ))}
                {card.list && (
                  <ul className="panel__list">
                    {card.list.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
              </div>
              {card.action && (
                <p className="deck__action">
                  {card.action.overlay ? (
                    <button type="button" onClick={() => setOverlay(card.action.overlay)}>
                      {card.action.label} &rarr;
                    </button>
                  ) : (
                    <a href={card.action.href}>{card.action.label} &rarr;</a>
                  )}
                </p>
              )}
            </article>
          )
        })}

        <button type="button" className="deck__shuffle" ref={chrome} onClick={shuffle}>
          <span className="deck__shuffle-key">border</span>
          <span className="deck__shuffle-value">{label}</span>
          <span aria-hidden="true">&#8646;</span>
          <span className="sr-only">Try the next border treatment</span>
        </button>
      </section>

      <Overlay open={overlay === 'meetups'} onClose={() => setOverlay(null)} title="Past meetups">
        <MeetupArchive />
      </Overlay>
      <Overlay open={overlay === 'sponsors'} onClose={() => setOverlay(null)} title="Sponsor and partners">
        <Sponsors />
      </Overlay>
    </>
  )
}
