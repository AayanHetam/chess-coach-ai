import gsap from "gsap";
import Lenis from "lenis";
import Head from "next/head";
import Link from "next/link";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef } from "react";
import ChessScene from "./ChessScene";
import styles from "./test-3d.module.css";

const scrollMoments = [
  {
    number: "01",
    eyebrow: "See the whole board",
    title: "Train your vision.",
    copy: "Turn complex positions into clear plans with coaching that adapts to the way you think.",
  },
  {
    number: "02",
    eyebrow: "Play with purpose",
    title: "Own the next move.",
    copy: "Build calculation, pattern recognition, and confidence—one focused session at a time.",
  },
];

export default function Test3DLanding() {
  const experienceRef = useRef<HTMLDivElement>(null);
  const scrollProgress = useRef(0);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({
      duration: 1.15,
      smoothWheel: true,
      wheelMultiplier: 0.85,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const trigger = ScrollTrigger.create({
      trigger: experienceRef.current,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: (self) => {
        scrollProgress.current = self.progress;
      },
    });

    const context = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((element) => {
        gsap.fromTo(
          element,
          { autoAlpha: 0, y: 42 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: element,
              start: "top 82%",
              once: true,
            },
          }
        );
      });
    }, experienceRef);

    return () => {
      context.revert();
      trigger.kill();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return (
    <>
      <Head>
        <title>Master Every Move — Chess Masti AI</title>
        <meta
          name="description"
          content="An experimental 3D landing experience for Chess Masti AI."
        />
        <meta name="theme-color" content="#040806" />
      </Head>

      <div className={styles.page} ref={experienceRef}>
        <div className={styles.ambientGlow} aria-hidden="true" />
        <header className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="Chess Masti home">
            <span className={styles.brandMark}>♞</span>
            <span>CHESS MASTI</span>
          </Link>
          <span className={styles.navLabel}>AI CHESS COACHING</span>
        </header>

        <div className={styles.scene} aria-hidden="true">
          <ChessScene scrollProgress={scrollProgress} />
          <div className={styles.sceneVignette} />
          <div className={styles.dragHint}>
            <span />
            Move your cursor
          </div>
        </div>

        <main className={styles.story}>
          <section className={styles.hero}>
            <div className={styles.heroCopy}>
              <p className={styles.kicker}>
                <span />
                Your game, elevated
              </p>
              <h1>
                Master
                <br />
                Every <em>Move</em>
              </h1>
              <p className={styles.intro}>
                Personal chess coaching that reveals what the engine sees—and
                teaches you how to see it too.
              </p>
              <Link href="/onboarding" className={styles.cta}>
                <span>Start Training</span>
                <span className={styles.ctaArrow}>↗</span>
              </Link>
              <div className={styles.proof}>
                <div className={styles.avatars} aria-hidden="true">
                  <span>♟</span>
                  <span>♙</span>
                  <span>♞</span>
                </div>
                <p>
                  <strong>Built for your next breakthrough</strong>
                  Adaptive analysis. Human explanations.
                </p>
              </div>
            </div>
            <div className={styles.scrollCue} aria-hidden="true">
              <span>Scroll to explore</span>
              <i />
            </div>
          </section>

          {scrollMoments.map((moment) => (
            <section className={styles.moment} key={moment.number}>
              <article className={styles.momentCard} data-reveal>
                <span className={styles.momentNumber}>{moment.number}</span>
                <p className={styles.momentEyebrow}>{moment.eyebrow}</p>
                <h2>{moment.title}</h2>
                <p className={styles.momentCopy}>{moment.copy}</p>
              </article>
            </section>
          ))}
        </main>

        <footer className={styles.footer}>
          <span>Chess Masti AI</span>
          <span>Make every move count.</span>
        </footer>
      </div>
    </>
  );
}
