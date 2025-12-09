# JLPTFiver 🍙📚
**Five grammar points a day. Every day. No fuss.**

🔗 Live app: https://elronimous.github.io/JLPTFiver/

JLPTFiver is a lightweight, browser-based study page that serves up **5 JLPT grammar points per level, per day**—perfect if you want a simple daily routine without heavy SRS overhead. It’s designed for consistency: you can jump to any date (past or future) and see the same set for that day.

> The grammar list order + links are based on **BunPro** for convenience, but you’ll need to **collect your own example sentences** (from books, notes, chats, games, whatever) and add them either **line-by-line** or via the **bulk importer**.  
> Not affiliated with BunPro.

---

## What it does (the gist)
- Shows **5 grammar points per JLPT level (N5 → N1)** each day
- Cycles through a level so you’ll eventually see **every point**, then it loops
- Each grammar point links straight to **BunPro** for quick reading (and optional SRS’ing there)

---

## Features

### Daily grammar feed
Use the date controls (**Today / Prev / Next / Calendar**) to:
- revisit missed days
- preview upcoming days
- keep your study “streak” moving in a way that actually fits real life

---

### Filters + “View All” search
- Toggle which JLPT levels are active (or show everything)
- Hit **View All** to open a searchable list and quickly find grammar by Japanese or English keywords
- Filter by **Seen / Unseen**, and jump straight into a grammar point’s notes

---

## Custom sentences (your own examples)
Every grammar point can have your own sentence set.

- Click the pencil icon at the bottom of the grammar dropdown to edit
- Add entries one-by-one, or import in bulk
- Highlight any text and click the palette icon to colour-highlight it with that level’s JLPT colour
- Optional: hide English by default (useful if you want JP-first review)

---

## Bulk sentence importer
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

**Highlight markup:** Wrap text with `#` to auto-highlight it on import:  
この#文法#は大事  
This #grammar# is important  

**Smart paste (from BunPro/webpages):**  
If you paste text that includes webpage formatting (highlighted spans / bold / etc.), the importer can automatically convert it into `#...#` highlight markup, with blank lines removed—so you can paste once and keep moving.

---

## Study Log (Anki heatmap vibes, friendlier)
Inspired by the Anki Review Heatmap, but made more flexible.

- Visiting the page fills in today automatically
- You can also click any day to toggle it on/off (past or future)
- Stats available (configurable):
  - First Visit
  - Streak
  - Total
- There’s a dedicated Study Log settings menu for small customisations (colours, month titles, which stats to show, etc.)

**Goals (optional):**
- Add simple goals tied to dates (emoji + text)
- If multiple goals are on the same day, the emoji indicator can cycle through them

---

## Cram Mode (flashcards using your sentences)
Turn your saved sentences into flashcard-style cram sessions.

**Build a deck:**
- Filter by JLPT levels
- Filter by **Seen/Starred**
- Filter by **Emoji score range**
- Choose how many sentences per grammar point
- See counts like “Selected Grammar: N5=X, N4=X…” and total cards

**Custom cram lists:**
- Save your current selection as a named list
- Load lists instantly from a dropdown
- Add to an existing list (no duplicates)
- Delete a custom list when you no longer need it

**During a session:**
- Front: Japanese sentence  
- Flip: JP + EN + grammar point + meaning
- Mark **Right** to remove a card
- Mark **Wrong** to reveal the back, then press **Next** (the card is returned to the deck and shuffled)

**End of session:**
- See the grammar points you marked wrong
- Option to retry the wrong ones, or select exactly which ones to cram again
- Option to save the session’s selection into a new or existing cram list

**Save & resume:**
- Manual “Save progress” button
- If there’s a saved session, you’ll be prompted to resume on next open
- Quitting clears the active session

---

## Settings
A few practical toggles live in the main settings menu, including:
- Show Study Log (hide the heatmap entirely if you don’t want it)
- Hide English by default (your default choice when opening sentence dropdowns)
- Emoji Score System (optional “tiny progress” tracker per grammar point) 🌑🌘🌗🌖🌝🌔🌓🌒💫⭐🌟🌌🌃🌆🌇☁️🌥️🌤️🌞
- Star system ⭐ (a simple “mark as seen” flag)
- Export / Import tools

---

## Export / Import (highly recommended)
Everything is stored in your browser (localStorage), so backing up is smart.

- Export your settings + custom data to JSON
- Export is **selective** (choose which parts of your data to include)
- Import supports **merge or overwrite**, and you can choose what categories to import
- Includes safety options (like “delete all data” with double confirmation)

---

## Final note
Turn up each day, do your five, keep it moving. Consistency beats intensity.

Good luck with your study — and have fun with it. 🙌
