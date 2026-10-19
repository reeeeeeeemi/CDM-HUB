"use client";

/* ==================================================================== *
 *  PROTOTYPE — le chat d'un event. À jeter une fois validé.
 *
 *  Une bulle en bas à droite de la fiche, qui ouvre le chat par-dessus.
 *  Les messages sont les vrais (table event_comments), en temps réel par
 *  Supabase Realtime. Les réactions et les réponses à un message, elles,
 *  ne vivent qu'en mémoire : elles demanderont deux tables.
 *
 *  Les non-lus se comptent depuis la dernière ouverture, retenue dans le
 *  navigateur — la vraie version la retiendra en base.
 * ==================================================================== */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Send, Reply, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { nameOf } from "@/lib/hub-data";

const supabase = createClient();
const REACTIONS = ["👍", "😂", "❤️", "🔥", "😮"];

// ---------- non-lus ----------
const readKey = (id) => `hub:chat-read:${id}`;
const lastRead = (id) => { try { return Number(window.localStorage.getItem(readKey(id)) || 0); } catch { return 0; } };
const markRead = (id) => { try { window.localStorage.setItem(readKey(id), String(Date.now())); } catch {} };
/** Les messages des autres arrivés depuis la dernière ouverture du chat. */
export const unreadOf = (ev, me) =>
  typeof window === "undefined" ? 0 : (ev.comments || []).filter((c) => c.by !== me && c.at > lastRead(ev.id)).length;

const initials = (name) => {
  const w = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : String(name || "").slice(0, 2)).toUpperCase();
};
const hhmm = (ms) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (ms) => {
  const d = new Date(ms), t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === y.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
};

/**
 * Les messages de l'event, en direct : un ajout ou une suppression chez un
 * autre arrive ici sans recharger. Le sien revient aussi, déjà affiché —
 * l'identifiant est le même, on l'ignore.
 */
function useLiveComments(eventId, actions) {
  useEffect(() => {
    const ch = supabase
      .channel(`chat:${eventId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_comments", filter: `event_id=eq.${eventId}` },
        ({ new: c }) => actions.receiveComment(eventId, { id: c.id, by: c.author_id, text: c.body, at: new Date(c.created_at).getTime() }))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "event_comments" },
        ({ old }) => old?.id && actions.dropComment(eventId, old.id))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId, actions]);
}

export function ChatBubble({ ev, me, actions }) {
  const [open, setOpen] = useState(false);
  // Relu à chaque message : la bulle compte ce qui arrive pendant qu'on lit la fiche.
  const [, tick] = useState(0);
  useLiveComments(ev.id, actions);
  const unread = open ? 0 : unreadOf(ev, me);

  // Un message qui arrive pendant qu'on lit la fiche : la bulle rebondit une
  // fois. Pas au chargement — ce qui attendait déjà n'est pas une arrivée.
  const seen = useRef(null);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    if (seen.current !== null && unread > seen.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 700);
      seen.current = unread;
      return () => clearTimeout(t);
    }
    seen.current = unread;
  }, [unread]);

  const close = () => { markRead(ev.id); setOpen(false); tick((n) => n + 1); };

  return (
    <>
      <style>{CSS}</style>
      {!open && (
        <button className={"ch-bubble" + (bump ? " bump" : "")} onClick={() => setOpen(true)}
          aria-label={unread > 0 ? `Ouvrir le chat, ${unread} nouveau${unread > 1 ? "x" : ""} message${unread > 1 ? "s" : ""}` : "Ouvrir le chat"}>
          <MessageCircle size={24} />
          {/* Un point, pas un compteur : sur la fiche on sait déjà de quel
              plan il s'agit, le chiffre est dans l'agenda. */}
          {unread > 0 && <span className="ch-dot" />}
        </button>
      )}
      {open && <ChatSheet ev={ev} me={me} actions={actions} onClose={close} />}
    </>
  );
}

function ChatSheet({ ev, me, actions, onClose }) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [menu, setMenu] = useState(null);
  // En mémoire seulement, le temps du prototype.
  const [reactions, setReactions] = useState({});
  const [replies, setReplies] = useState({});
  const list = useRef(null);
  const press = useRef(null);
  const msgs = useMemo(() => [...(ev.comments || [])].sort((a, b) => a.at - b.at), [ev.comments]);
  const byId = useMemo(() => Object.fromEntries(msgs.map((m) => [m.id, m])), [msgs]);

  // Ouvrir, c'est lire. Et la liste suit le dernier message.
  useEffect(() => { markRead(ev.id); }, [ev.id, msgs.length]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [msgs.length]);

  // La page derrière ne défile plus sous le doigt.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && (menu ? setMenu(null) : onClose());
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [menu, onClose]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    const id = actions.addComment(ev.id, t);
    if (replyTo && id) setReplies((r) => ({ ...r, [id]: replyTo.id }));
    setText("");
    setReplyTo(null);
  };

  const react = (id, emoji) => {
    setReactions((r) => {
      const cur = { ...(r[id] || {}) };
      const who = new Set(cur[emoji] || []);
      if (who.has(me)) who.delete(me);
      else who.add(me);
      cur[emoji] = [...who];
      return { ...r, [id]: cur };
    });
    setMenu(null);
  };

  // Appui long au doigt, clic droit à la souris.
  const holdStart = (m) => { press.current = setTimeout(() => setMenu(m), 420); };
  const holdEnd = () => clearTimeout(press.current);

  return (
    <div className="ch-overlay" onClick={onClose}>
      <div className="ch-sheet" role="dialog" aria-label={`Chat · ${ev.title}`} onClick={(e) => e.stopPropagation()}>
        <div className="ch-head">
          <div><b>{ev.title}</b><em>{msgs.length} message{msgs.length > 1 ? "s" : ""} · prototype</em></div>
          <button aria-label="Fermer" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="ch-list" ref={list}>
          {msgs.length === 0 && <p className="ch-empty">Pas encore de message. Lance la discussion 👋</p>}
          {msgs.map((m, i) => {
            // Le jour et le nom ne s'affichent qu'au changement, comme dans
            // toute messagerie : on compare au message précédent.
            const prev = msgs[i - 1];
            const day = dayLabel(m.at);
            const showDay = !prev || dayLabel(prev.at) !== day;
            const showName = m.by !== me && (!prev || prev.by !== m.by || showDay);
            const mine = m.by === me;
            const quoted = replies[m.id] && byId[replies[m.id]];
            const reacts = Object.entries(reactions[m.id] || {}).filter(([, who]) => who.length);
            return (
              <React.Fragment key={m.id}>
                {showDay && <div className="ch-day">{day}</div>}
                <div className={"ch-msg" + (mine ? " mine" : "")}>
                  {!mine && <span className="ch-av" style={{ visibility: showName ? "visible" : "hidden" }}>{initials(nameOf(m.by))}</span>}
                  <div className="ch-col">
                    {showName && <span className="ch-name">{nameOf(m.by)}</span>}
                    <div className="ch-bub"
                      onPointerDown={() => holdStart(m)} onPointerUp={holdEnd} onPointerLeave={holdEnd}
                      onContextMenu={(e) => { e.preventDefault(); setMenu(m); }}>
                      {quoted && <span className="ch-quote"><b>{nameOf(quoted.by)}</b>{quoted.text}</span>}
                      <span className="ch-text">{m.text}</span>
                      <span className="ch-time">{hhmm(m.at)}</span>
                    </div>
                    {reacts.length > 0 && (
                      <div className="ch-reacts">
                        {reacts.map(([e, who]) => (
                          <button key={e} className={who.includes(me) ? "on" : ""} onClick={() => react(m.id, e)}>{e} {who.length}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {menu && (
          <div className="ch-menu-back" onClick={() => setMenu(null)}>
            <div className="ch-menu" onClick={(e) => e.stopPropagation()}>
              <p className="ch-menu-msg">{menu.text}</p>
              <div className="ch-emojis">
                {REACTIONS.map((e) => <button key={e} onClick={() => react(menu.id, e)}>{e}</button>)}
              </div>
              <button className="ch-act" onClick={() => { setReplyTo(menu); setMenu(null); }}><Reply size={16} /> Répondre</button>
              {menu.by === me && (
                <button className="ch-act danger" onClick={() => { actions.delComment(ev.id, menu.id); setMenu(null); }}><Trash2 size={16} /> Supprimer</button>
              )}
            </div>
          </div>
        )}

        <div className="ch-input">
          {replyTo && (
            <div className="ch-replying">
              <span><b>Réponse à {replyTo.by === me ? "toi" : nameOf(replyTo.by)}</b>{replyTo.text}</span>
              <button aria-label="Annuler la réponse" onClick={() => setReplyTo(null)}><X size={15} /></button>
            </div>
          )}
          <div className="ch-row">
            <textarea value={text} rows={1} placeholder="Écris un message…" onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <button className="ch-send" aria-label="Envoyer" disabled={!text.trim()} onClick={send}><Send size={18} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.ch-bubble{position:fixed;right:18px;bottom:calc(22px + env(safe-area-inset-bottom));z-index:45;width:58px;height:58px;border-radius:50%;border:0;
  background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 26px rgba(180,69,31,.38);}
.ch-bubble:active{transform:scale(.95);}
.ch-dot{position:absolute;top:3px;right:3px;width:13px;height:13px;border-radius:50%;background:#EF4444;border:2.5px solid var(--bg);}
.ch-bubble.bump{animation:ch-bump .65s ease;}
@keyframes ch-bump{0%,100%{transform:translateY(0)}30%{transform:translateY(-10px)}55%{transform:translateY(0)}75%{transform:translateY(-4px)}}

.ch-overlay{position:fixed;inset:0;z-index:70;background:rgba(20,16,28,.35);display:flex;align-items:flex-end;justify-content:center;}
.ch-sheet{width:100%;max-width:560px;height:88dvh;background:var(--bg);border-radius:22px 22px 0 0;display:flex;flex-direction:column;overflow:hidden;
  box-shadow:0 -10px 40px rgba(0,0,0,.18);}
.ch-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px 12px;background:var(--card);border-bottom:1px solid var(--line);}
.ch-head div{display:flex;flex-direction:column;min-width:0;}
.ch-head b{font-family:'Bricolage Grotesque';font-size:17px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ch-head em{font-style:normal;font-size:12px;color:var(--muted);}
.ch-head button{display:flex;border:0;background:var(--bg);border-radius:10px;padding:7px;color:var(--ink);}

.ch-list{flex:1;overflow-y:auto;padding:12px 12px 6px;display:flex;flex-direction:column;gap:3px;-webkit-overflow-scrolling:touch;}
.ch-empty{margin:auto;color:var(--muted);font-size:14px;text-align:center;}
.ch-day{align-self:center;margin:12px 0 6px;padding:3px 10px;border-radius:10px;background:var(--line);color:var(--muted);font-size:11.5px;font-weight:700;text-transform:capitalize;}
.ch-msg{display:flex;align-items:flex-end;gap:7px;max-width:86%;}
.ch-msg.mine{align-self:flex-end;flex-direction:row-reverse;}
.ch-av{flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--ink);color:#fff;font-family:'Bricolage Grotesque';font-weight:700;font-size:11px;line-height:28px;text-align:center;}
.ch-col{display:flex;flex-direction:column;min-width:0;}
.ch-msg.mine .ch-col{align-items:flex-end;}
.ch-name{font-size:11.5px;font-weight:700;color:var(--muted);margin:6px 0 2px 10px;}
.ch-bub{position:relative;padding:7px 11px 6px;border-radius:17px;background:var(--card);border:1px solid var(--line);color:var(--ink);
  -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}
.ch-msg.mine .ch-bub{background:var(--accent);border-color:var(--accent);color:#fff;}
.ch-text{font-size:15px;line-height:1.35;white-space:pre-wrap;word-break:break-word;}
.ch-time{display:inline-block;margin-left:8px;font-size:10.5px;opacity:.6;vertical-align:bottom;}
.ch-quote{display:flex;flex-direction:column;margin:0 0 5px;padding:4px 8px;border-left:3px solid currentColor;border-radius:6px;background:rgba(0,0,0,.06);
  font-size:12.5px;opacity:.85;max-height:3.4em;overflow:hidden;}
.ch-msg.mine .ch-quote{background:rgba(255,255,255,.18);}
.ch-reacts{display:flex;gap:4px;margin-top:-4px;padding:0 6px;z-index:1;}
.ch-reacts button{border:1px solid var(--line);background:var(--card);border-radius:11px;padding:1px 7px;font-size:12px;color:var(--ink);}
.ch-reacts button.on{border-color:var(--accent);background:var(--accent-soft);}

.ch-menu-back{position:absolute;inset:0;z-index:5;background:rgba(20,16,28,.25);display:flex;align-items:flex-end;}
.ch-menu{width:100%;background:var(--card);border-radius:20px 20px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom));}
.ch-menu-msg{font-size:13.5px;color:var(--muted);margin-bottom:10px;max-height:3.6em;overflow:hidden;}
.ch-emojis{display:flex;justify-content:space-between;margin-bottom:10px;}
.ch-emojis button{width:52px;height:52px;border-radius:50%;border:0;background:var(--bg);font-size:26px;}
.ch-act{display:flex;align-items:center;gap:10px;width:100%;padding:13px 6px;border:0;border-top:1px solid var(--line);background:none;font-size:15px;font-weight:600;color:var(--ink);text-align:left;}
.ch-act.danger{color:#B91C1C;}

.ch-input{background:var(--card);border-top:1px solid var(--line);padding:8px 10px calc(8px + env(safe-area-inset-bottom));}
.ch-replying{display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:6px 10px;border-left:3px solid var(--accent);border-radius:8px;background:var(--bg);}
.ch-replying span{flex:1;min-width:0;display:flex;flex-direction:column;font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ch-replying b{color:var(--accent);}
.ch-replying button{display:flex;border:0;background:none;color:var(--muted);}
.ch-row{display:flex;align-items:flex-end;gap:8px;}
.ch-row textarea{flex:1;resize:none;max-height:120px;padding:10px 14px;border:1.5px solid var(--line);border-radius:20px;font-family:inherit;font-size:16px;line-height:1.3;
  background:var(--bg);color:var(--ink);outline:none;}
.ch-row textarea:focus{border-color:var(--accent);}
.ch-send{flex-shrink:0;width:42px;height:42px;border-radius:50%;border:0;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;}
.ch-send:disabled{background:var(--line);color:var(--muted);}
`;
