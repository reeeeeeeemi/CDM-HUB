"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Traduction entre la base, normalisée, et la forme imbriquée que l'interface
 * manipule depuis le prototype. Tout ce qui touche à Supabase vit ici : les
 * composants ne connaissent que les fonctions de ce fichier.
 */

const supabase = createClient();

/** Pseudos par identifiant, pour l'affichage. Rempli à chaque chargement. */
export const NAMES = {};
/** Dates de naissance par identifiant, pour le bandeau du jour J. */
export const BIRTHDAYS = {};
export const nameOf = (id) => NAMES[id] || "quelqu'un";

const ms = (iso) => (iso ? new Date(iso).getTime() : 0);

// ---------- lecture ----------

const EVENT_QUERY = `
  id, title, category, scale, city,
  starts_on, ends_on, starts_at, ends_at,
  place, place_url, place_id, description, links, modules,
  created_by, created_at, nudged_at,
  event_rsvps ( user_id, status ),
  event_comments ( id, author_id, body, created_at ),
  event_todos ( id, label, done, kind, created_by, done_by, created_at ),
  date_options ( id, on_date, end_date, added_by, date_votes ( user_id ) ),
  place_options ( id, label, url, place_id, added_by, place_votes ( user_id ) ),
  event_transport ( user_id, mode, seats, at_date, at_time ),
  event_hosting ( user_id, seeking, spots )
`;

function toEvent(r) {
  const rsvps = {};
  for (const v of r.event_rsvps || []) rsvps[v.user_id] = v.status;

  return {
    id: r.id,
    title: r.title,
    category: r.category,
    scale: r.scale,
    city: r.city || "",
    date: r.starts_on || "",
    endDate: r.ends_on || "",
    time: r.starts_at ? r.starts_at.slice(0, 5) : "",
    endTime: r.ends_at ? r.ends_at.slice(0, 5) : "",
    place: r.place || "",
    placeUrl: r.place_url || "",
    placeId: r.place_id || "",
    description: r.description || "",
    links: r.links || [],
    modules: r.modules || undefined,
    createdBy: r.created_by,
    createdAt: ms(r.created_at),
    nudgedAt: ms(r.nudged_at),
    rsvps,
    comments: (r.event_comments || [])
      .map((c) => ({ id: c.id, by: c.author_id, text: c.body, at: ms(c.created_at) }))
      .sort((a, b) => a.at - b.at),
    todos: (r.event_todos || [])
      .map((t) => ({ id: t.id, text: t.label, kind: t.kind || "todo", done: t.done, by: t.created_by, doneBy: t.done_by }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    datePoll: (r.date_options || []).map((o) => ({
      id: o.id, date: o.on_date, endDate: o.end_date || "", by: o.added_by,
      votes: (o.date_votes || []).map((v) => v.user_id),
    })),
    placePoll: (r.place_options || []).map((o) => ({
      id: o.id, label: o.label, url: o.url || "", placeId: o.place_id || "", by: o.added_by,
      votes: (o.place_votes || []).map((v) => v.user_id),
    })),
    transport: (r.event_transport || []).map((t) => ({
      id: t.user_id, by: t.user_id, mode: t.mode, seats: t.seats, at: t.at_time ? t.at_time.slice(0, 5) : "", atDate: t.at_date || "",
    })),
    hosting: (r.event_hosting || []).map((h) => ({
      id: h.user_id, by: h.user_id, seeking: h.seeking, spots: h.spots,
    })),
  };
}

/** Charge tout ce dont l'app a besoin, en trois requêtes. */
export async function loadHub() {
  const [profiles, events, avail, members, places] = await Promise.all([
    supabase.from("profiles").select("id, pseudo, birthday"),
    supabase.from("events").select(EVENT_QUERY).order("created_at", { ascending: false }),
    supabase.from("availability").select("id, user_id, starts_on, ends_on, note"),
    // Les profils incluent les inscrits pas encore admis : seule cette liste
    // dit qui est du groupe, et donc qui une relance toucherait.
    supabase.from("members").select("user_id"),
    supabase.from("places").select("id, owner_id, name, address, door_code, access").order("name"),
  ]);

  const error = profiles.error || events.error || avail.error || members.error || places.error;
  if (error) throw error;

  for (const k of Object.keys(NAMES)) delete NAMES[k];
  for (const k of Object.keys(BIRTHDAYS)) delete BIRTHDAYS[k];
  for (const p of profiles.data || []) {
    NAMES[p.id] = p.pseudo;
    if (p.birthday) BIRTHDAYS[p.id] = p.birthday;
  }

  return {
    events: (events.data || []).map(toEvent),
    members: (members.data || []).map((m) => m.user_id),
    places: (places.data || []).map((p) => ({
      id: p.id, ownerId: p.owner_id, name: p.name,
      address: p.address || "", doorCode: p.door_code || "", access: p.access || "",
    })),
    availability: (avail.data || []).map((a) => ({
      id: a.id, by: a.user_id, start: a.starts_on, end: a.ends_on || "", note: a.note || "",
    })),
  };
}

// ---------- écriture ----------
// Chaque fonction écrit une seule chose. L'interface met son état à jour de
// son côté ; ces appels persistent, ils ne relisent pas.

const orNull = (v) => (v ? v : null);

export async function insertEvent(e, me) {
  return supabase.from("events").insert({
    id: e.id, title: e.title, category: e.category, scale: e.scale,
    city: orNull(e.city), starts_on: orNull(e.date), ends_on: orNull(e.endDate),
    starts_at: orNull(e.time), ends_at: orNull(e.endTime),
    place: orNull(e.place), place_id: orNull(e.placeId), description: orNull(e.description),
    links: e.links || [], modules: e.modules, created_by: me,
  });
}

export const deleteEvent = (id) => supabase.from("events").delete().eq("id", id);

export const patchEvent = (id, patch) => supabase.from("events").update(patch).eq("id", id);

export const setRsvp = (eventId, me, status) =>
  status === null
    ? supabase.from("event_rsvps").delete().eq("event_id", eventId).eq("user_id", me)
    : supabase.from("event_rsvps").upsert({ event_id: eventId, user_id: me, status, updated_at: new Date().toISOString() });

export const addComment = (id, eventId, me, text) =>
  supabase.from("event_comments").insert({ id, event_id: eventId, author_id: me, body: text });
export const delComment = (id) => supabase.from("event_comments").delete().eq("id", id);

export const addTodo = (id, eventId, me, label, kind) =>
  supabase.from("event_todos").insert({ id, event_id: eventId, created_by: me, label, kind });
export const setTodoDone = (id, done, me) =>
  supabase.from("event_todos").update({ done, done_by: done ? me : null }).eq("id", id);
export const delTodo = (id) => supabase.from("event_todos").delete().eq("id", id);

export const addDateOption = (id, eventId, me, date, endDate) =>
  supabase.from("date_options").insert({ id, event_id: eventId, added_by: me, on_date: date, end_date: orNull(endDate) });
export const delDateOption = (id) => supabase.from("date_options").delete().eq("id", id);
export const voteDate = (optionId, me, on) =>
  on
    ? supabase.from("date_votes").insert({ option_id: optionId, user_id: me })
    : supabase.from("date_votes").delete().eq("option_id", optionId).eq("user_id", me);

export const addPlaceOption = (id, eventId, me, label, url, placeId) =>
  supabase.from("place_options").insert({ id, event_id: eventId, added_by: me, label, url: orNull(url), place_id: orNull(placeId) });
export const delPlaceOption = (id) => supabase.from("place_options").delete().eq("id", id);
export const votePlace = (optionId, me, on) =>
  on
    ? supabase.from("place_votes").insert({ option_id: optionId, user_id: me })
    : supabase.from("place_votes").delete().eq("option_id", optionId).eq("user_id", me);

export const setTransport = (eventId, me, entry) =>
  supabase.from("event_transport").upsert({
    event_id: eventId, user_id: me, mode: entry.mode,
    seats: entry.seats || 0, at_date: orNull(entry.atDate), at_time: orNull(entry.at),
  });
export const delTransport = (eventId, me) =>
  supabase.from("event_transport").delete().eq("event_id", eventId).eq("user_id", me);

export const setHosting = (eventId, me, entry) =>
  supabase.from("event_hosting").upsert({
    event_id: eventId, user_id: me, seeking: entry.seeking, spots: entry.spots || 0,
  });
export const delHosting = (eventId, me) =>
  supabase.from("event_hosting").delete().eq("event_id", eventId).eq("user_id", me);

export const addAvailability = (id, me, o) =>
  supabase.from("availability").insert({ id, user_id: me, starts_on: o.start, ends_on: o.end || o.start, note: orNull(o.note) });
export const delAvailability = (id) => supabase.from("availability").delete().eq("id", id);
