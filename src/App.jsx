import { useState, useEffect, useRef } from "react";
import { Trophy, Upload, Plus, ArrowLeft, Calendar, User, Loader2, X, ImageOff, Search, Camera, Mail, CheckCircle2, Trash2, Pencil, Check, Medal } from "lucide-react";
import { supabase } from "./supabaseClient";

const DEFAULT_CATEGORIES = [
  "Strongest Pint Drunk",
  "Most Northern Pint Drunk",
  "Most Southern Pint Drunk",
  "Lowest Altitude Pint Drunk",
  "Highest Altitude Pint Drunk",
  "Coldest Pint Drunk",
  "Fastest Pint Drunk",
];

const REACTIONS = [
  { key: "thumbsup", emoji: "👍" },
  { key: "laughing", emoji: "😂" },
  { key: "shocked", emoji: "😲" },
  { key: "cheers", emoji: "🍻" },
  { key: "fire", emoji: "🔥" },
];

function emptyReactions() {
  return REACTIONS.reduce((acc, r) => ({ ...acc, [r.key]: 0 }), {});
}

function resizeImage(file, maxDim = 900, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not load image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const POSTING_RULES = [
  "Be honest — records should be genuine, not made up for a laugh.",
  "Include a real photo as evidence, not a stock image or someone else's photo.",
  "Keep descriptions and photos appropriate — nothing offensive, cruel, or NSFW.",
  "Records and comments should stay good-natured. No targeting or embarrassing other members without their consent.",
  "Drink responsibly — this is meant to be fun, not a reason to overdo it.",
];

const RECORD_RULES = [
  "A record must be about a pint or pint-drinking (strength, location, temperature, altitude, speed, and so on).",
  "New submissions become the current holder for that category — the previous holder moves into the past holders list automatically.",
  "You can create a brand new category if yours doesn't fit an existing one.",
  "Records can be beaten at any time by a better submission in the same category — that's the whole point.",
  "Anyone can react to a record with an emoji, but be a good sport about it.",
];

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function findSimilarCategory(input, categories) {
  const clean = input.trim().toLowerCase();
  if (!clean) return null;
  let best = null;
  let bestScore = 0;
  for (const cat of categories) {
    const catClean = cat.toLowerCase();
    if (catClean === clean) continue; // exact match isn't a "similar" warning, it's just the same one
    const maxLen = Math.max(clean.length, catClean.length, 1);
    const score = 1 - levenshtein(clean, catClean) / maxLen;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return bestScore >= 0.55 ? best : null;
}

export default function App() {
  const [categories, setCategories] = useState([]);
  const [recordsByCategory, setRecordsByCategory] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem("hasSeenRules") === "true" ? "home" : "rules";
    } catch {
      return "home";
    }
  });
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [unsubscribeState, setUnsubscribeState] = useState(null); // null | "working" | "done" | "error"
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    categoryChoice: "",
    newCategory: "",
    title: "",
    holderName: "",
    description: "",
    photo: null,
    photoPreview: null,
  });
  const [photoProcessing, setPhotoProcessing] = useState(false);

  useEffect(() => {
    loadAll();
    const token = new URLSearchParams(window.location.search).get("unsubscribe");
    if (token) {
      setUnsubscribeState("working");
      supabase
        .from("subscribers")
        .delete()
        .eq("unsubscribe_token", token)
        .then(({ error }) => setUnsubscribeState(error ? "error" : "done"));
    }
  }, []);

  async function loadAll() {
    setLoading(true);
    setLoadError("");
    try {
      const { data: cats, error: catErr } = await supabase
        .from("categories")
        .select("name")
        .order("created_at", { ascending: true });
      if (catErr) throw catErr;

      const { data: recs, error: recErr } = await supabase
        .from("records")
        .select("*")
        .order("created_at", { ascending: false });
      if (recErr) throw recErr;

      let categoryNames = (cats || []).map((c) => c.name);
      if (categoryNames.length === 0) {
        // First run: seed default categories
        await supabase.from("categories").insert(DEFAULT_CATEGORIES.map((name) => ({ name })));
        categoryNames = DEFAULT_CATEGORIES;
      }

      const grouped = {};
      (recs || []).forEach((row) => {
        const entry = {
          id: row.id,
          category: row.category,
          title: row.title,
          holderName: row.holder_name,
          description: row.description,
          photo: row.photo,
          date: row.created_at,
          reactions: row.reactions || emptyReactions(),
        };
        grouped[row.category] = grouped[row.category] || [];
        grouped[row.category].push(entry);
      });

      setCategories(categoryNames);
      setRecordsByCategory(grouped);
    } catch (e) {
      setLoadError(
        "Couldn't connect to the database. Check your Supabase URL/key in .env are correct and the tables exist."
      );
    } finally {
      setLoading(false);
    }
  }

  function openSubmit(presetCategory) {
    setForm({
      categoryChoice: presetCategory || "",
      newCategory: "",
      title: "",
      holderName: "",
      description: "",
      photo: null,
      photoPreview: null,
    });
    setSaveError("");
    setView("submit");
  }

  async function handlePhotoChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setPhotoProcessing(true);
    try {
      const dataUrl = await resizeImage(file);
      setForm((f) => ({ ...f, photo: dataUrl, photoPreview: dataUrl }));
    } catch {
      setSaveError("Couldn't process that image, try a different photo.");
    } finally {
      setPhotoProcessing(false);
    }
  }

  async function handleSubmitRecord(e) {
    e.preventDefault();
    const category = (form.newCategory.trim() || form.categoryChoice).trim();
    if (!category || !form.title.trim() || !form.holderName.trim() || !form.description.trim() || !form.photo) {
      setSaveError("Fill in every field and add a photo before submitting.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      if (!categories.includes(category)) {
        const { error: catInsertErr } = await supabase
          .from("categories")
          .upsert({ name: category }, { onConflict: "name" });
        if (catInsertErr) throw catInsertErr;
      }

      const { error: recErr } = await supabase.from("records").insert({
        category,
        title: form.title.trim(),
        holder_name: form.holderName.trim(),
        description: form.description.trim(),
        photo: form.photo,
        reactions: emptyReactions(),
      });
      if (recErr) throw recErr;

      await loadAll();
      setSelectedCategory(category);
      setView("category");
    } catch {
      setSaveError("Something went wrong saving the record. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReact(category, entryId, key) {
    const entries = recordsByCategory[category] || [];
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const nextReactions = { ...emptyReactions(), ...entry.reactions, [key]: (entry.reactions[key] || 0) + 1 };

    // optimistic update
    setRecordsByCategory((prev) => ({
      ...prev,
      [category]: prev[category].map((e) => (e.id === entryId ? { ...e, reactions: nextReactions } : e)),
    }));

    const { error } = await supabase.from("records").update({ reactions: nextReactions }).eq("id", entryId);
    if (error) {
      // revert on failure
      setRecordsByCategory((prev) => ({
        ...prev,
        [category]: prev[category].map((e) => (e.id === entryId ? entry : e)),
      }));
    }
  }

  const DELETE_PASSCODE = "8332";

  async function handleDelete(category, entryId) {
    const entered = window.prompt("Enter the passcode to delete this record:");
    if (entered === null) return; // cancelled
    if (entered !== DELETE_PASSCODE) {
      alert("Incorrect passcode. Record not deleted.");
      return;
    }

    const previousEntries = recordsByCategory[category] || [];
    setRecordsByCategory((prev) => ({
      ...prev,
      [category]: prev[category].filter((e) => e.id !== entryId),
    }));

    const { error } = await supabase.from("records").delete().eq("id", entryId);
    if (error) {
      // revert on failure
      setRecordsByCategory((prev) => ({ ...prev, [category]: previousEntries }));
      alert("Couldn't delete that record. Try again.");
    }
  }

  async function handleRenameCategory(oldName, newNameRaw) {
    const newName = newNameRaw.trim();
    if (!newName || newName === oldName) return { ok: true };

    if (categories.some((c) => c !== oldName && c.toLowerCase() === newName.toLowerCase())) {
      return { ok: false, message: "A category with that name already exists." };
    }

    const previousCategories = categories;
    const previousRecords = recordsByCategory;

    // optimistic update
    setCategories((prev) => prev.map((c) => (c === oldName ? newName : c)));
    setRecordsByCategory((prev) => {
      const next = { ...prev };
      const entries = (next[oldName] || []).map((e) => ({ ...e, category: newName }));
      delete next[oldName];
      next[newName] = entries;
      return next;
    });
    if (selectedCategory === oldName) setSelectedCategory(newName);

    const { error: catErr } = await supabase.from("categories").update({ name: newName }).eq("name", oldName);
    const { error: recErr } = await supabase.from("records").update({ category: newName }).eq("category", oldName);

    if (catErr || recErr) {
      setCategories(previousCategories);
      setRecordsByCategory(previousRecords);
      if (selectedCategory === newName) setSelectedCategory(oldName);
      return { ok: false, message: "Couldn't save the rename. Try again." };
    }
    return { ok: true };
  }

  if (unsubscribeState === "working" || unsubscribeState === "done" || unsubscribeState === "error") {
    return (
      <div className="max-w-md mx-auto p-6 text-center mt-16">
        {unsubscribeState === "working" && (
          <p className="text-neutral-500 flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={18} /> Unsubscribing...
          </p>
        )}
        {unsubscribeState === "done" && (
          <>
            <CheckCircle2 className="mx-auto text-green-600 mb-2" size={32} />
            <p className="text-neutral-700">You've been unsubscribed from email updates.</p>
          </>
        )}
        {unsubscribeState === "error" && (
          <p className="text-red-600">Couldn't find that subscription — it may already be removed.</p>
        )}
        <a href={window.location.pathname} className="text-amber-700 text-sm hover:underline mt-4 inline-block">
          Back to the site
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-neutral-500 gap-2">
        <Loader2 className="animate-spin" size={20} />
        <span>Loading records...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 font-sans">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-amber-200">
        <button className="flex items-center gap-2 text-left" onClick={() => setView("home")}>
          <div className="bg-amber-800 text-amber-50 rounded-full p-2 flex-shrink-0">
            <Trophy size={22} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-amber-950 leading-tight">Book of Guinless Records</h1>
            <p className="text-xs text-amber-700">A club record for every glass raised</p>
          </div>
        </button>
        {view !== "submit" && view !== "subscribe" && view !== "rules" && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button
              onClick={() => setView("leaderboard")}
              className="flex items-center gap-1 border border-amber-300 text-amber-800 hover:bg-amber-50 px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              <Medal size={16} /> Leaderboard
            </button>
            <button
              onClick={() => setView("subscribe")}
              className="flex items-center gap-1 border border-amber-300 text-amber-800 hover:bg-amber-50 px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              <Mail size={16} /> Get updates
            </button>
            <button
              onClick={() => openSubmit(view === "category" ? selectedCategory : "")}
              className="flex items-center gap-1 bg-amber-800 hover:bg-amber-900 text-white px-3 py-2 rounded-lg text-sm font-medium transition"
            >
              <Plus size={16} /> New record
            </button>
          </div>
        )}
      </header>

      {loadError && (
        <div className="mb-4 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">
          {loadError}
        </div>
      )}

      {view === "home" && (
        <HomeView
          categories={[...categories].sort((a, b) => {
            const aTime = recordsByCategory[a]?.[0] ? new Date(recordsByCategory[a][0].date).getTime() : 0;
            const bTime = recordsByCategory[b]?.[0] ? new Date(recordsByCategory[b][0].date).getTime() : 0;
            return bTime - aTime;
          })}
          records={recordsByCategory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSelect={(cat) => {
            setSelectedCategory(cat);
            setView("category");
          }}
        />
      )}

      {view === "category" && selectedCategory && (
        <CategoryView
          category={selectedCategory}
          entries={recordsByCategory[selectedCategory] || []}
          onBack={() => setView("home")}
          onNewRecord={() => openSubmit(selectedCategory)}
          onReact={handleReact}
          onDelete={handleDelete}
          onRename={handleRenameCategory}
        />
      )}

      {view === "leaderboard" && (
        <LeaderboardView records={recordsByCategory} onBack={() => setView("home")} />
      )}

      {view === "rules" && (
        <RulesView
          onContinue={() => {
            try {
              localStorage.setItem("hasSeenRules", "true");
            } catch {
              // ignore storage errors, just proceed
            }
            setView("home");
          }}
        />
      )}

      {view === "subscribe" && <SubscribeView onCancel={() => setView(selectedCategory ? "category" : "home")} />}

      {view === "submit" && (
        <SubmitView
          form={form}
          setForm={setForm}
          categories={categories}
          onCancel={() => setView(selectedCategory ? "category" : "home")}
          onSubmit={handleSubmitRecord}
          onPhotoChange={handlePhotoChange}
          photoProcessing={photoProcessing}
          saving={saving}
          saveError={saveError}
          fileInputRef={fileInputRef}
        />
      )}

      {view !== "rules" && (
        <p className="text-center text-xs text-neutral-400 mt-8">
          Records are visible to everyone in the club. ·{" "}
          <button onClick={() => setView("rules")} className="underline hover:text-neutral-600">
            Posting &amp; record rules
          </button>
        </p>
      )}
    </div>
  );
}

function LeaderboardView({ records, onBack }) {
  const allEntries = Object.values(records).flat();

  const currentHolders = Object.values(records)
    .map((entries) => entries[0])
    .filter(Boolean);

  const recordCounts = {};
  currentHolders.forEach((e) => {
    recordCounts[e.holderName] = (recordCounts[e.holderName] || 0) + 1;
  });

  const reactionCounts = {};
  allEntries.forEach((e) => {
    const total = Object.values(e.reactions || {}).reduce((sum, n) => sum + n, 0);
    reactionCounts[e.holderName] = (reactionCounts[e.holderName] || 0) + total;
  });

  const topRecordHolders = Object.entries(recordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topReactionEarners = Object.entries(reactionCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-amber-700 mb-4 hover:underline">
        <ArrowLeft size={15} /> All categories
      </button>
      <h2 className="text-lg font-bold text-amber-950 mb-4 flex items-center gap-2">
        <Medal size={20} /> Leaderboard
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-amber-900 mb-2">Most records currently held</h3>
          {topRecordHolders.length === 0 ? (
            <p className="text-sm text-neutral-400 italic">No records yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {topRecordHolders.map(([name, count], i) => (
                <li
                  key={name}
                  className="flex items-center justify-between text-sm border border-amber-100 rounded-lg px-3 py-2 bg-white"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6 text-center">{medals[i] || i + 1}</span>
                    <span className="font-medium text-amber-950">{name}</span>
                  </span>
                  <span className="text-neutral-500">{count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-amber-900 mb-2">Most reactions received</h3>
          {topReactionEarners.length === 0 ? (
            <p className="text-sm text-neutral-400 italic">No reactions yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {topReactionEarners.map(([name, count], i) => (
                <li
                  key={name}
                  className="flex items-center justify-between text-sm border border-amber-100 rounded-lg px-3 py-2 bg-white"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-6 text-center">{medals[i] || i + 1}</span>
                    <span className="font-medium text-amber-950">{name}</span>
                  </span>
                  <span className="text-neutral-500">{count}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <p className="text-xs text-neutral-400 mt-4">
        Rankings are based on the name typed into "your name" when submitting — spell it consistently to get proper credit!
      </p>
    </div>
  );
}

function RulesView({ onContinue }) {
  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="text-amber-800" size={22} />
        <h2 className="text-lg font-bold text-amber-950">Welcome to the club</h2>
      </div>

      <div className="mb-5">
        <h3 className="text-sm font-semibold text-amber-900 mb-2">Posting rules</h3>
        <ul className="space-y-1.5 text-sm text-neutral-700">
          {POSTING_RULES.map((rule, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-amber-400">•</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-semibold text-amber-900 mb-2">Record rules</h3>
        <ul className="space-y-1.5 text-sm text-neutral-700">
          {RECORD_RULES.map((rule, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-amber-400">•</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </div>

      <button
        onClick={onContinue}
        className="w-full bg-amber-800 hover:bg-amber-900 text-white px-4 py-2.5 rounded-lg text-sm font-semibold"
      >
        Got it, take me to the records
      </button>
    </div>
  );
}

function SubscribeView({ onCancel }) {
  const [email, setEmail] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [status, setStatus] = useState("idle"); // idle | saving | done | error

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("saving");
    const { error } = await supabase
      .from("subscribers")
      .upsert({ email: email.trim().toLowerCase(), frequency }, { onConflict: "email" });
    setStatus(error ? "error" : "done");
  }

  return (
    <div className="max-w-md">
      <button onClick={onCancel} className="flex items-center gap-1 text-sm text-amber-700 mb-4 hover:underline">
        <ArrowLeft size={15} /> Back
      </button>
      <h2 className="text-lg font-bold text-amber-950 mb-1">Get email updates</h2>
      <p className="text-sm text-neutral-500 mb-4">Hear about new records as they're set.</p>

      {status === "done" ? (
        <div className="border border-green-200 bg-green-50 rounded-lg p-4 text-sm text-green-800 flex items-start gap-2">
          <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
          <span>
            You're subscribed{" "}
            {frequency === "instant" ? "to instant emails for every new record." : "to a daily digest of new records."}{" "}
            Every email includes an unsubscribe link.
          </span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Email address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">How often?</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm border border-amber-200 rounded-lg px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="frequency"
                  value="instant"
                  checked={frequency === "instant"}
                  onChange={() => setFrequency("instant")}
                />
                Instantly — one email per new record
              </label>
              <label className="flex items-center gap-2 text-sm border border-amber-200 rounded-lg px-3 py-2 cursor-pointer">
                <input
                  type="radio"
                  name="frequency"
                  value="daily"
                  checked={frequency === "daily"}
                  onChange={() => setFrequency("daily")}
                />
                Daily digest — one summary email per day
              </label>
            </div>
          </div>

          {status === "error" && (
            <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">
              Something went wrong saving that. Try again.
            </div>
          )}

          <button
            type="submit"
            disabled={status === "saving"}
            className="w-full bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
          >
            {status === "saving" ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            {status === "saving" ? "Saving..." : "Subscribe"}
          </button>
        </form>
      )}
    </div>
  );
}

function RecordThumb({ photo, alt }) {
  if (!photo) {
    return (
      <div className="w-full h-40 bg-amber-100 rounded-lg flex items-center justify-center text-amber-400">
        <ImageOff size={28} />
      </div>
    );
  }
  return <img src={photo} alt={alt} className="w-full h-40 object-cover rounded-lg bg-amber-100" />;
}

function HomeView({ categories, records, onSelect, searchQuery, setSearchQuery }) {
  const query = searchQuery.trim().toLowerCase();

  const searchResults = query
    ? Object.values(records)
        .flat()
        .filter((e) =>
          [e.title, e.holderName, e.description, e.category].some((field) =>
            (field || "").toLowerCase().includes(query)
          )
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : null;

  return (
    <div>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search records, holders, categories..."
          className="w-full border border-amber-200 rounded-lg pl-9 pr-8 py-2 text-sm"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {searchResults ? (
        searchResults.length === 0 ? (
          <div className="text-center py-16 text-neutral-500">No records match "{searchQuery}".</div>
        ) : (
          <div className="space-y-2">
            {searchResults.map((e) => (
              <button
                key={e.id}
                onClick={() => onSelect(e.category)}
                className="w-full flex gap-3 items-start text-left border border-amber-200 rounded-lg p-2 bg-white hover:border-amber-400 transition"
              >
                <img src={e.photo} alt={e.title} className="w-16 h-16 object-cover rounded-md bg-amber-100 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-amber-700 font-medium uppercase tracking-wide truncate">{e.category}</p>
                  <p className="text-sm font-semibold text-amber-950 truncate">{e.title}</p>
                  <p className="text-xs text-neutral-500 flex items-center gap-1">
                    <User size={11} /> {e.holderName}
                    <span className="mx-1">·</span>
                    <Calendar size={11} /> {formatDate(e.date)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : categories.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">No categories yet. Be the first to set a record.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {categories.map((cat) => {
            const entries = records[cat] || [];
            const current = entries[0];
            return (
              <button
                key={cat}
                onClick={() => onSelect(cat)}
                className="text-left border border-amber-200 rounded-xl p-3 hover:border-amber-400 hover:shadow-sm transition bg-white"
              >
                <RecordThumb photo={current && current.photo} alt={cat} />
                <h3 className="mt-2 font-semibold text-amber-950 text-sm">{cat}</h3>
                {current ? (
                  <>
                    <p className="text-xs text-neutral-500 mt-1 flex items-center gap-1">
                      <User size={12} /> {current.holderName}
                    </p>
                    <ReactionBar reactions={current.reactions} readOnly size="small" />
                  </>
                ) : (
                  <p className="text-xs text-neutral-400 mt-1 italic">No record set yet</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReactionBar({ reactions, onReact, size = "normal", readOnly = false }) {
  const counts = { ...emptyReactions(), ...reactions };
  const active = REACTIONS.filter((r) => !readOnly || counts[r.key] > 0);
  if (readOnly && active.length === 0) return null;

  const btnClass =
    size === "small"
      ? "flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border border-amber-200 hover:bg-amber-100 transition"
      : "flex items-center gap-1 text-sm px-2 py-1 rounded-full border border-amber-200 hover:bg-amber-100 transition";
  const spanClass =
    size === "small"
      ? "flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full border border-amber-100 bg-amber-50"
      : "flex items-center gap-1 text-sm px-2 py-1 rounded-full border border-amber-100 bg-amber-50";

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {active.map((r) =>
        readOnly ? (
          <span key={r.key} className={spanClass}>
            <span>{r.emoji}</span>
            <span className="text-neutral-500">{counts[r.key]}</span>
          </span>
        ) : (
          <button
            key={r.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReact(r.key);
            }}
            className={btnClass}
          >
            <span>{r.emoji}</span>
            {counts[r.key] > 0 && <span className="text-neutral-500">{counts[r.key]}</span>}
          </button>
        )
      )}
    </div>
  );
}

function CategoryView({ category, entries, onBack, onNewRecord, onReact, onDelete, onRename }) {
  const [current, ...past] = entries;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category);
  const [renameError, setRenameError] = useState("");
  const [renaming, setRenaming] = useState(false);

  async function saveRename() {
    setRenaming(true);
    setRenameError("");
    const result = await onRename(category, draft);
    setRenaming(false);
    if (result.ok) {
      setEditing(false);
    } else {
      setRenameError(result.message || "Couldn't rename category.");
    }
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-amber-700 mb-4 hover:underline">
        <ArrowLeft size={15} /> All categories
      </button>

      {editing ? (
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="text-lg font-bold text-amber-950 border border-amber-300 rounded-lg px-2 py-1 flex-1"
              autoFocus
            />
            <button
              onClick={saveRename}
              disabled={renaming}
              className="text-green-700 hover:bg-green-50 rounded-lg p-1.5 disabled:opacity-50"
              title="Save"
            >
              {renaming ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setDraft(category);
                setRenameError("");
              }}
              className="text-neutral-400 hover:bg-neutral-100 rounded-lg p-1.5"
              title="Cancel"
            >
              <X size={18} />
            </button>
          </div>
          {renameError && <p className="text-xs text-red-600 mt-1">{renameError}</p>}
        </div>
      ) : (
        <h2 className="text-lg font-bold text-amber-950 mb-3 flex items-center gap-2">
          {category}
          <button
            onClick={() => {
              setDraft(category);
              setEditing(true);
            }}
            className="text-neutral-300 hover:text-amber-700 transition"
            title="Rename category"
          >
            <Pencil size={15} />
          </button>
        </h2>
      )}

      {!current ? (
        <div className="text-center py-12 border border-dashed border-amber-300 rounded-xl text-neutral-500">
          <p className="mb-3">No record holder yet for this category.</p>
          <button onClick={onNewRecord} className="bg-amber-800 hover:bg-amber-900 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Claim this record
          </button>
        </div>
      ) : (
        <div className="border border-amber-200 rounded-xl p-4 bg-white relative">
          <button
            onClick={() => onDelete(category, current.id)}
            title="Delete this record"
            className="absolute top-3 right-3 text-neutral-300 hover:text-red-600 transition"
          >
            <Trash2 size={16} />
          </button>
          <div className="flex flex-col sm:flex-row gap-4">
            <img
              src={current.photo}
              alt={current.title}
              className="w-full sm:w-56 h-48 object-cover rounded-lg bg-amber-100 flex-shrink-0"
            />
            <div className="flex-1">
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Current record holder</p>
              <h3 className="text-lg font-bold text-amber-950 mt-1 pr-6">{current.title}</h3>
              <p className="text-sm text-neutral-700 flex items-center gap-1 mt-1">
                <User size={13} /> {current.holderName}
              </p>
              <p className="text-xs text-neutral-400 flex items-center gap-1 mt-0.5">
                <Calendar size={12} /> {formatDate(current.date)}
              </p>
              <p className="text-sm text-neutral-600 mt-2 whitespace-pre-wrap">{current.description}</p>
              <ReactionBar reactions={current.reactions} onReact={(key) => onReact(category, current.id, key)} />
            </div>
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-semibold text-amber-900 mb-2">Past record holders</h4>
          <div className="space-y-2">
            {past.map((e) => (
              <div key={e.id} className="flex gap-3 items-start border border-amber-100 rounded-lg p-2 bg-amber-50/40 relative">
                <img src={e.photo} alt={e.title} className="w-16 h-16 object-cover rounded-md bg-amber-100 flex-shrink-0" />
                <div className="min-w-0 flex-1 pr-6">
                  <p className="text-sm font-medium text-amber-950 truncate">{e.title}</p>
                  <p className="text-xs text-neutral-500 flex items-center gap-1">
                    <User size={11} /> {e.holderName}
                    <span className="mx-1">·</span>
                    <Calendar size={11} /> {formatDate(e.date)}
                  </p>
                  <ReactionBar reactions={e.reactions} onReact={(key) => onReact(category, e.id, key)} size="small" />
                </div>
                <button
                  onClick={() => onDelete(category, e.id)}
                  title="Delete this record"
                  className="absolute top-2 right-2 text-neutral-300 hover:text-red-600 transition"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmitView({
  form,
  setForm,
  categories,
  onCancel,
  onSubmit,
  onPhotoChange,
  photoProcessing,
  saving,
  saveError,
  fileInputRef,
}) {
  return (
    <form onSubmit={onSubmit} className="max-w-lg">
      <button type="button" onClick={onCancel} className="flex items-center gap-1 text-sm text-amber-700 mb-4 hover:underline">
        <ArrowLeft size={15} /> Cancel
      </button>
      <h2 className="text-lg font-bold text-amber-950 mb-4">Submit a new record</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Category</label>
          <select
            value={form.categoryChoice}
            onChange={(e) => setForm((f) => ({ ...f, categoryChoice: e.target.value, newCategory: "" }))}
            className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">— Choose existing category —</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="text-xs text-neutral-400 mt-1">or create a new one:</p>
          <input
            type="text"
            placeholder="New category name"
            value={form.newCategory}
            onChange={(e) => setForm((f) => ({ ...f, newCategory: e.target.value, categoryChoice: "" }))}
            className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm mt-1"
          />
          {(() => {
            const similar = findSimilarCategory(form.newCategory, categories);
            if (!similar) return null;
            return (
              <div className="mt-2 flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <span className="text-amber-700 flex-1">
                  This looks similar to an existing category, <strong>"{similar}"</strong>. Might already be the same record.
                </span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, categoryChoice: similar, newCategory: "" }))}
                  className="text-amber-800 underline whitespace-nowrap flex-shrink-0"
                >
                  Use that one
                </button>
              </div>
            );
          })()}
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Record title</label>
          <input
            type="text"
            placeholder='e.g. "9.2% pint drunk at 4,200ft"'
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Your name</label>
          <input
            type="text"
            value={form.holderName}
            onChange={(e) => setForm((f) => ({ ...f, holderName: e.target.value }))}
            className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Why this is a record</label>
          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Explain the achievement, how it was measured, witnesses etc."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Photo evidence</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhotoChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className="flex items-center gap-2 border border-amber-300 text-amber-800 hover:bg-amber-50 px-3 py-2 rounded-lg text-sm font-medium"
          >
            <Camera size={16} />
            {isMobileDevice() ? "Open camera" : "Choose photo"}
          </button>
          {isMobileDevice() && (
            <p className="text-xs text-neutral-400 mt-1">Prefer an existing photo? Your camera app usually has a gallery option too.</p>
          )}
          {photoProcessing && (
            <p className="text-xs text-neutral-400 mt-1 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Processing photo...
            </p>
          )}
          {form.photoPreview && (
            <div className="relative mt-2 inline-block">
              <img src={form.photoPreview} alt="Preview" className="w-32 h-32 object-cover rounded-lg border border-amber-200" />
              <button
                type="button"
                onClick={() => {
                  setForm((f) => ({ ...f, photo: null, photoPreview: null }));
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute -top-2 -right-2 bg-white border border-amber-300 rounded-full p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {saveError && (
          <div className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">{saveError}</div>
        )}

        <button
          type="submit"
          disabled={saving || photoProcessing}
          className="w-full bg-amber-800 hover:bg-amber-900 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {saving ? "Submitting..." : "Submit record"}
        </button>
      </div>
    </form>
  );
}
