---
name: Add a writing system
about: GlyphLint models sixteen writing systems and ignores the rest of Unicode. Tell us about one it gets wrong.
title: 'Writing system: '
labels: writing-system
---

<!--
This is the issue this project wants most. You do not need to write any code to open it, and you do
not need to write perfect English. If you read a language whose typography this tool mishandles,
you know something the code needs.
-->

## Which writing system

<!-- The script, and the languages that use it. For example: Bengali, used for Bengali and Assamese. -->

## What breaks

<!--
What does a website get wrong about this writing system that a Latin-only checker would never
notice? Some examples of the kind of thing this project exists to catch:

- letters that must join and get separated by CSS
- marks above or below the line that get clipped by a fixed height
- text with no spaces between words, broken in the wrong place
- a direction that has to be declared and usually is not
- a line height that is fine for Latin and too tight here
-->

## A page that shows it

<!--
A public URL, or a small piece of HTML and CSS that reproduces it. This is the most valuable part of
the report: it becomes a test fixture, and a fixture is what stops the problem coming back.
-->

## What correct looks like

<!--
Describe or show the same text rendered properly. A screenshot of both is ideal — one image of
"broken" beside "correct" explains more than a page of description.
-->

## Typographic requirements, if you know them

<!--
Optional, and genuinely useful if you have it. Does this script need more leading than Latin? How
much? Is there a W3C layout requirements document for it (ALREQ, HLREQ, JLREQ, CLREQ, or another)?

If you are not sure of a number, say so — the project records unsourced numbers as "estimate" and
never invents a citation, so an honest "I think about 1.6, but I have no document for it" is a
perfectly good answer.
-->
