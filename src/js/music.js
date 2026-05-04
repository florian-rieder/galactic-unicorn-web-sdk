import { playBuzzTone } from "./audio.js";

const NOTE_MAP = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

let bpm = 120;
let ticksPerBeat = 4;
let music = null;
let noteTimeout = null;
let musicIndex = 0;
let musicLoop = false;

export function setTempo(new_bpm) {
  if (new_bpm <= 0) {
    throw new Error("Tempo must be greater than 0.");
  }
  bpm = Number(new_bpm);
}

export function setTicksPerBeat(new_ticks_per_beat) {
  if (new_ticks_per_beat <= 0) {
    throw new Error("Ticks per beat must be greater than 0.");
  }
  ticksPerBeat = new_ticks_per_beat;
}

export function loadMusic(music_string) {
  console.log("loadMusic", music_string);
  // Parse the music string and create a list of notes and durations
  music = parseMusic(music_string);

  console.log("loadMusic", music);
}

export function playMusic(loop) {
  // Prevent multiple music plays from overlapping
  clearTimeout(noteTimeout);
  noteTimeout = null;

  musicLoop = !!loop;
  musicIndex = 0;

  if (!music || music.length === 0) {
    throw new Error("No music to play. Call loadMusic() first.");
  }

  playNextNote();
}

export function pauseMusic() {
  clearTimeout(noteTimeout);
  noteTimeout = null;
}

export function resumeMusic() {
  // If the music is already playing, don't resume it
  if (noteTimeout != null) {
    return;
  }

  playNextNote();
}

export function stopMusic() {
  if (!music) {
    return;
  }
  music = null;
  musicIndex = 0;
  clearTimeout(noteTimeout);
  noteTimeout = null;
}

function tickToMilliseconds(ticks) {
  return (ticks / ticksPerBeat) * (60 / bpm) * 1000;
}

function parseMusic(music_string) {
  // Parse the music string and create a list of notes and durations
  const notes = music_string.split(" ");
  return notes.map((token) => {
    const [noteText, durationTicks] = token.split(":");

    // Convert the note text to a frequency
    const frequency = noteToFrequency(noteText);

    // Convert the duration ticks to milliseconds
    const duration = tickToMilliseconds(parseInt(durationTicks));

    return { frequency, duration };
  });
}

// Convert the note (e.g. "A4") to a frequency (e.g. 440 Hz)
function noteToFrequency(note) {
  if (note == "0") return 0;

  const m = note.match(/^([A-G]#?)(\d)$/i);
  if (!m) {
    throw new Error("Invalid note: " + note);
  }
  const name = m[1].toUpperCase();
  const octave = parseInt(m[2], 10);
  if (!(name in NOTE_MAP)) {
    throw new Error("Invalid note: " + note);
  }
  const semitone = NOTE_MAP[name];

  const n = (octave + 1) * 12 + semitone;

  return 440 * 2 ** ((n - 69) / 12);
}

function playNextNote() {
  if (!music || music.length === 0) {
    return;
  }

  if (musicIndex >= music.length) {
    // If we've reached the end of the music, loop if enabled
    if (musicLoop) {
      musicIndex = 0;
    } else {
      // If we've reached the end of the music and looping is disabled, stop the music
      stopMusic();
      return;
    }
  }

  const note = music[musicIndex];

  // If the note is not a rest (frequency 0), play the note for the given duration
  if (note.frequency != 0) {
    playBuzzTone(note.frequency, note.duration);
  }

  // Move the needle to the next note
  musicIndex++;
  noteTimeout = setTimeout(playNextNote, note.duration);
}
