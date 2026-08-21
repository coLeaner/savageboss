---
title: "My Week With Claude Opus 7: Field Notes From a Future I Made Up"
description: "A playful, imagined review of a Claude model that doesn't exist yet — and a working example of how I put photos and charts inside a Note."
date: 2026-07-23
tags: ["AI", "Building", "Speculative"]
draft: false
---

Small disclaimer before we start, so nobody quote me wrong: **there is no Claude Opus 7 — not yet.** As I write this, the newest Claude models are the Claude 5 family, Opus 4.8, and Haiku 4.5. So treat everything below as me daydreaming out loud about where the tools are headed, sitting here in Paynesville with the fan struggling against the heat. It's fiction with a straight face — and it doubles as my test post for putting **pictures and charts** inside a Note.

## The Setup

I imagine it lands on a Tuesday, the way these things always do. I'm mid-sentence fixing a stubborn bug in mansastock, and I paste the whole tangled mess in — three files, a stack trace, and my half-formed theory — expecting to babysit it through five rounds.

It answers once. Correctly. With the fix *and* the reason.

<figure>
  <img src="/Where i live.jpg" alt="The corner of Paynesville where I do most of my building." />
  <figcaption>Where the daydreaming happens — my corner of Paynesville City. (Swap this path for any image in <code>/public</code>.)</figcaption>
</figure>

## What Actually Felt Different

The jump I keep imagining isn't raw speed — it's that it stops losing the thread. I paste a whole repo's worth of context and, three questions later, it still remembers the weird constraint I mentioned at the top. No re-explaining. That alone would change how I work more than any benchmark score.

So I did what any tinkerer does: I made up some numbers and rated my imaginary week across the things I actually care about, one to ten.

<figure class="chart">
  <p class="chart-title">My made-up ratings — Opus 7, one hard week (0–10)</p>
  <svg viewBox="0 0 600 235" role="img" aria-labelledby="ch-t ch-d">
    <title id="ch-t">Imagined ratings for Claude Opus 7 across five dimensions</title>
    <desc id="ch-d">Reasoning depth 9.5, Long-context recall 9.5, Code quality 9, Vibe and personality 8.5, and Speed 8, on a scale of 0 to 10.</desc>
    <line x1="160" y1="8" x2="160" y2="196" stroke="var(--line)" stroke-width="1" />
    <line x1="360" y1="8" x2="360" y2="196" stroke="var(--line)" stroke-width="1" />
    <line x1="560" y1="8" x2="560" y2="196" stroke="var(--line)" stroke-width="1" />
    <text x="148" y="28" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">Reasoning depth</text>
    <rect x="160" y="17" width="380" height="22" rx="4" fill="#f5921f" />
    <text x="548" y="28" dominant-baseline="middle" font-size="12" fill="var(--muted)">9.5</text>
    <text x="148" y="68" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">Long-context recall</text>
    <rect x="160" y="57" width="380" height="22" rx="4" fill="#f5921f" />
    <text x="548" y="68" dominant-baseline="middle" font-size="12" fill="var(--muted)">9.5</text>
    <text x="148" y="108" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">Code quality</text>
    <rect x="160" y="97" width="360" height="22" rx="4" fill="#f5921f" />
    <text x="528" y="108" dominant-baseline="middle" font-size="12" fill="var(--muted)">9.0</text>
    <text x="148" y="148" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">Vibe / personality</text>
    <rect x="160" y="137" width="340" height="22" rx="4" fill="#f5921f" />
    <text x="508" y="148" dominant-baseline="middle" font-size="12" fill="var(--muted)">8.5</text>
    <text x="148" y="188" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">Speed</text>
    <rect x="160" y="177" width="320" height="22" rx="4" fill="#f5921f" />
    <text x="488" y="188" dominant-baseline="middle" font-size="12" fill="var(--muted)">8.0</text>
    <text x="160" y="216" text-anchor="middle" font-size="11" fill="var(--faint)">0</text>
    <text x="360" y="216" text-anchor="middle" font-size="11" fill="var(--faint)">5</text>
    <text x="560" y="216" text-anchor="middle" font-size="11" fill="var(--faint)">10</text>
  </svg>
</figure>

Speed sits lowest not because it's slow, but because in my imagination it *thinks* longer before answering — and honestly, I'll trade a few seconds for an answer I don't have to double-check.

## Where the Week Actually Went

And since numbers make a Note feel honest, here's my (illustrative) usage for the week — the hours I imagine I'd spend leaning on it, split by what I was actually building.

<figure class="chart">
  <p class="chart-title">My usage — hours by project, one week</p>
  <svg viewBox="0 0 600 190" role="img" aria-labelledby="us-t us-d">
    <title id="us-t">Imagined weekly usage hours by project</title>
    <desc id="us-d">mansastock 6.5 hours, MAS Pharmacy 4 hours, client sites 3 hours, and this blog 1.5 hours.</desc>
    <line x1="160" y1="8" x2="160" y2="156" stroke="var(--line)" stroke-width="1" />
    <line x1="360" y1="8" x2="360" y2="156" stroke="var(--line)" stroke-width="1" />
    <line x1="560" y1="8" x2="560" y2="156" stroke="var(--line)" stroke-width="1" />
    <text x="148" y="28" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">mansastock</text>
    <rect x="160" y="17" width="325" height="22" rx="4" fill="#f3b5e5" />
    <text x="493" y="28" dominant-baseline="middle" font-size="12" fill="var(--muted)">6.5h</text>
    <text x="148" y="68" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">MAS Pharmacy</text>
    <rect x="160" y="57" width="200" height="22" rx="4" fill="#f3b5e5" />
    <text x="368" y="68" dominant-baseline="middle" font-size="12" fill="var(--muted)">4.0h</text>
    <text x="148" y="108" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">Client sites</text>
    <rect x="160" y="97" width="150" height="22" rx="4" fill="#f3b5e5" />
    <text x="318" y="108" dominant-baseline="middle" font-size="12" fill="var(--muted)">3.0h</text>
    <text x="148" y="148" text-anchor="end" dominant-baseline="middle" font-size="13" fill="var(--text)">This blog</text>
    <rect x="160" y="137" width="75" height="22" rx="4" fill="#f3b5e5" />
    <text x="243" y="148" dominant-baseline="middle" font-size="12" fill="var(--muted)">1.5h</text>
    <text x="160" y="176" text-anchor="middle" font-size="11" fill="var(--faint)">0h</text>
    <text x="360" y="176" text-anchor="middle" font-size="11" fill="var(--faint)">4h</text>
    <text x="560" y="176" text-anchor="middle" font-size="11" fill="var(--faint)">8h</text>
  </svg>
</figure>

Most of it goes to mansastock, same as always — the tool changes, but the pile of work waiting for me doesn't.

## The Part I'm Not Daydreaming About

Here's the real thing, and it's true today, not in some made-up future: the tool keeps getting sharper, but the taste still has to come from me. It can write the function; it can't decide whether MAS Pharmacy actually needs it. That part — knowing what to build and what to leave alone — no version number fixes for you.

So I'll keep an eye on what's actually released, keep my expectations honest, and keep building small, quiet tools that work. And when a real new model shows up, *then* I'll write you the real review.

Until then — this was fiction, but the plantain frying outside is very real. 🇱🇷
