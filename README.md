# JLPTFiver 🍙📚
**Five grammar points a day. Every day. No fuss.**

🔗 Live app: https://elronimous.github.io/JLPTFiver/

JLPTFiver is a lightweight, browser-based study page that serves up **5 JLPT grammar points per level, per day**—perfect if you want a simple daily routine without heavy SRS overhead. It’s designed for consistency: you can jump to any date (past or future) and see the same set for that day.

---

## What it does (the gist)
- Shows **5 grammar points per JLPT level (N5 → N1) each day**
- Cycles through a level so you’ll eventually see **every point**, then it **loops**
- Each grammar point links straight to **BunPro** for quick reading (and optional SRS’ing there)

---

## Features

### Daily grammar feed
Use the date controls (Today / Prev / Next / Calendar) to:
- revisit missed days
- preview upcoming days
- keep your study “streak” moving in a way that actually fits real life

### Filters + “View All” search
- Toggle which JLPT levels are active (or show everything)
- Hit **View All** to open a searchable list and quickly find grammar by **Japanese or English keywords**

---

## Custom sentences (your own examples)
Every grammar point can have your own sentence set.

- Click the **pencil icon** at the bottom of the grammar dropdown to edit
- Add entries one-by-one, or import in bulk
- Highlight any text and click the **palette icon** to colour-highlight it with that level’s JLPT colour

### Bulk sentence importer
Paste multiple sentences at once—great for grabbing examples from books, notes, or chats.

**Format (JP + EN pairs):**
- Line 1: Japanese
- Line 2: English
- Repeat

Example:
日本語の文  
English sentence  
次の日本語  
Next English  

**JP-only also works** (English will be left blank):
日本語だけ  
この行も日本語だけ  

**Highlight markup:**
Wrap text with `#` to auto-highlight it on import:
この#文法#は大事  
This #grammar# is important  

---

## Study Log (Anki heatmap vibes, friendlier)
Inspired by the Anki Review Heatmap, but made more flexible.

- Visiting the page fills in today automatically
- You can also **click any day** to toggle it on/off (past *or* future)
- Stats available (configurable):
  - **First Visit**
  - **Streak**
  - **Total**

There’s a dedicated **Study Log settings** menu for small customisations (colours, month titles, which stats to show, etc.).

---

## Settings
A few practical toggles live in the main settings menu, including:
- **Show Study Log** (hide the heatmap entirely if you don’t want it)
- **Hide English by default** (your default choice when opening sentence dropdowns)
- **Emoji Score System** (optional “tiny progress” tracker per grammar point)
🌑🌘🌗🌖🌝🌔🌓🌒💫⭐🌟🌌🌃🌆🌇☁️🌥️🌤️🌞

### Star system ⭐
A simple “mark as seen” flag—use it as a quick visual cue when browsing big lists, or when a point comes back around later.

---

## Export / Import (highly recommended)
Everything is stored in your browser (**localStorage**), so backing up is smart.

- Export your settings + custom data to JSON
- Import later to restore everything (or move to another device)

---

## Final note
Turn up each day, do your five, keep it moving. Consistency beats intensity.

Good luck with your study — and have fun with it. 🙌



## To do list
- Add Titled Sections for user sentences, allowing dragging of sections, sentences.
- When clicking Color Paelte highlighter need to unclude a text weight 800, also need a 'remove' styling option
- Much later: Add a 'Cram' flashcard feature for Grammar points utilising the user sentences. Should be able to select 'seen' 'not seen' 'JLPTN_ level' 'Custom selection' and 'How many examples from each grammar point', basic Right or Wrong answers with JP Sentence on front, if Wrong then put card back in deck and reshuffle until deck is depleted.
- Add a Flag Pole system to the Study Log = 'Add' Target date, and have a Emoji selector, and a text field for hover. With this, a user can set custom dates in the future as goals, like 'N3 JLPT TEST', "FINALS WEEK' etc. Will also add a Countdown to NEXT target date (Days Remaining counter)

---

## Credit / Disclaimer
JLPTFiver links to BunPro for grammar explanations and study. This project is not affiliated with BunPro.
