# The Book of Beer Records

A club site for pint-related world records: photo, description, and an emoji
reaction bar (👍 😂 😲 🍻 🔥). Built with Vite + React, data stored in Supabase.

## 1. Create the database (Supabase, free tier)

1. Go to https://supabase.com, sign up, and create a new project.
2. Once it's ready, open the **SQL Editor** and paste in the contents of
   `supabase-schema.sql` from this folder, then run it. This creates the
   `categories` and `records` tables.
3. Go to **Project settings > API**. Copy the **Project URL** and the
   **anon public** key — you'll need both next.

Note: the schema uses open read/write policies, meaning anyone with your
site's link can add records, add categories, and react — there's no login.
That matches how the club site works today. If you later want to require
sign-in or moderate submissions, that's a policy change in Supabase plus
some auth UI — happy to help with that when you're ready.

## 2. Run it locally (optional, to test first)

```bash
npm install
cp .env.example .env
# edit .env and paste in your Supabase URL + anon key
npm run dev
```

Open the local URL it prints (usually http://localhost:5173).

## 3. Deploy it (Vercel)

1. Push this folder to a GitHub repo (Vercel deploys from GitHub).
2. Go to https://vercel.com, sign up (free), click **Add New Project**,
   and import that repo. Vercel auto-detects Vite.
3. Before deploying, add the environment variables under **Settings >
   Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. You'll get a live `.vercel.app` URL within a minute.

Netlify works the same way if you'd rather use that (drag-and-drop the
`dist` folder after `npm run build`, or connect the GitHub repo — same env
vars, set under Site settings > Environment variables).

## 4. Point your own domain at it

1. Buy a domain if you don't have one (e.g. via Namecheap, Google Domains,
   or directly through Vercel's own domain registration).
2. In your Vercel project, go to **Settings > Domains** and add your
   domain (e.g. `bookofbeerrecords.co.uk`).
3. Vercel gives you either an A record or CNAME to add at your domain
   registrar's DNS settings. Add that record, then wait for DNS to
   propagate (usually minutes, sometimes a few hours).

## Notes

- Photos are stored as resized base64 images directly in the database
  (kept under ~900px wide) rather than a separate file storage bucket —
  simpler to set up, fine for club-scale traffic. If the club grows large,
  moving photos to Supabase Storage would be a sensible next step.
- There's no login, so it's an honesty-system site — anyone with the link
  can submit records or add reactions, same spirit as the club itself.
