"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { Loader2, Pencil, Plus, Trash2, Upload, Eye, EyeOff, RefreshCw } from "lucide-react";

// Same limit as the backend (MAX_ACTIVE_BANNERS)
const MAX_ACTIVE_BANNERS = 5;
const API_PATH = "/api/admin/hero-banners";
const BROWN = "#7A5A3C";

type HeroBanner = {
  id: number;
  title: string;
  subtitle: string;
  image_url: string;
  cta_text: string;
  cta_link: string;
  display_order: number;
  is_active: number;
};

type FormValues = {
  title: string;
  subtitle: string;
  cta_text: string;
  cta_link: string;
  display_order: string;
  is_active: boolean;
};

// Values shown in an empty "Add Banner Slide" form.
function emptyForm(nextOrder: number): FormValues {
  return {
    title: "",
    subtitle: "",
    cta_text: "Shop now",
    cta_link: "/",
    display_order: String(nextOrder),
    is_active: true,
  };
}

// Turns an existing banner into form values for editing.
function formFromBanner(banner: HeroBanner): FormValues {
  return {
    title: banner.title,
    subtitle: banner.subtitle,
    cta_text: banner.cta_text,
    cta_link: banner.cta_link,
    display_order: String(banner.display_order),
    is_active: banner.is_active === 1,
  };
}

// Reads the error message from a backend reply.
async function readErrorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return data.error || `Request failed (${res.status})`;
}

export default function HeroBannersManager() {
  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HeroBanner | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm(1));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const liveCount = banners.filter((b) => b.is_active === 1).length;

  // Loads all banners (live and hidden) from the backend.
  const loadBanners = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API_PATH, { cache: "no-store" });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const data = await res.json();
      setBanners(data.banners || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load banners.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBanners();
  }, [loadBanners]);

  // Frees the temporary preview URL when it changes or the component closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Shows a green message for a few seconds.
  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(""), 3000);
  }

  // Opens the empty form to add a new banner.
  function openAddForm() {
    setEditing(null);
    setForm(emptyForm(banners.length + 1));
    setImageFile(null);
    setPreviewUrl("");
    setError("");
    setFormOpen(true);
  }

  // Opens the form filled with an existing banner.
  function openEditForm(banner: HeroBanner) {
    setEditing(banner);
    setForm(formFromBanner(banner));
    setImageFile(null);
    setPreviewUrl("");
    setError("");
    setFormOpen(true);
  }

  // Closes the form and forgets the chosen file.
  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    setImageFile(null);
    setPreviewUrl("");
  }

  // Remembers the chosen image file and makes a live preview.
  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  // Sends the add/edit form to the backend as FormData.
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!editing && !imageFile) {
      setError("Please choose an image file.");
      return;
    }

    const data = new FormData();
    data.append("title", form.title);
    data.append("subtitle", form.subtitle);
    data.append("cta_text", form.cta_text);
    data.append("cta_link", form.cta_link);
    data.append("display_order", form.display_order);
    data.append("is_active", String(form.is_active));
    if (imageFile) data.append("image", imageFile);

    setSaving(true);
    try {
      const url = editing ? `${API_PATH}/${editing.id}` : API_PATH;
      const res = await fetch(url, { method: editing ? "PUT" : "POST", body: data });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      showNotice(editing ? "Banner updated." : "Banner added.");
      closeForm();
      await loadBanners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the banner.");
    } finally {
      setSaving(false);
    }
  }

  // Switches a banner between Live and Hidden.
  async function toggleActive(banner: HeroBanner) {
    setError("");
    const data = new FormData();
    data.append("is_active", String(banner.is_active !== 1));
    try {
      const res = await fetch(`${API_PATH}/${banner.id}`, { method: "PUT", body: data });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      await loadBanners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the banner.");
    }
  }

  // Deletes a banner after the owner confirms.
  async function deleteBanner(banner: HeroBanner) {
    if (!window.confirm(`Delete the banner "${banner.title}"? This cannot be undone.`)) return;
    setError("");
    try {
      const res = await fetch(`${API_PATH}/${banner.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      showNotice("Banner deleted.");
      await loadBanners();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the banner.");
    }
  }

  const imageToShow = previewUrl || editing?.image_url || "";
  const inputClass =
    "mt-1 w-full rounded-lg border border-neutral-300 bg-white p-2 text-xs outline-none focus:border-[#7A5A3C]";

  return (
    <section className="mt-5 space-y-5" role="tabpanel">
      {/* Header: title, live counter and buttons */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#E9DCC6] bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h3 className="text-base font-bold text-[#1F1A17]">Configured Hero Slides ({banners.length})</h3>
          <p className="mt-0.5 text-xs font-semibold text-[#7A5A3C]">
            Live on website: {liveCount} / {MAX_ACTIVE_BANNERS}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadBanners}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Slides
          </button>
          <button
            type="button"
            onClick={openAddForm}
            className="flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90"
            style={{ background: BROWN }}
          >
            <Plus className="h-4 w-4" />
            Add Banner Slide
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {notice}
        </div>
      )}

      {/* Add / Edit form */}
      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 rounded-2xl border-2 bg-white p-4 shadow-md sm:grid-cols-2 sm:p-6"
          style={{ borderColor: BROWN }}
        >
          <h3 className="text-base font-bold text-[#1F1A17] sm:col-span-2">
            {editing ? `Edit Banner: ${editing.title}` : "Add Banner Slide"}
          </h3>

          <div>
            <label className="block text-xs font-bold text-neutral-700">Title *</label>
            <input
              required
              maxLength={150}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">Subtitle / Tagline</label>
            <input
              maxLength={300}
              value={form.subtitle}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-neutral-700">
              Image {editing ? "(leave empty to keep the current image)" : "*"}
            </label>
            <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="h-24 w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 sm:w-44">
                {imageToShow ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageToShow} alt="Banner preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-400">No image</div>
                )}
              </div>
              <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 bg-[#FAF7F2] px-4 text-xs font-semibold text-[#7A5A3C] hover:border-[#7A5A3C]">
                <Upload className="h-4 w-4" />
                {imageFile ? imageFile.name : "Choose image file"}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageChange} className="hidden" />
              </label>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">JPEG, PNG or WebP, up to 5 MB.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">CTA Button Text</label>
            <input
              maxLength={60}
              value={form.cta_text}
              onChange={(e) => setForm({ ...form, cta_text: e.target.value })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">CTA Link</label>
            <input
              maxLength={200}
              value={form.cta_link}
              onChange={(e) => setForm({ ...form, cta_link: e.target.value })}
              placeholder="/coffee"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700">Display Order</label>
            <input
              type="number"
              step={1}
              value={form.display_order}
              onChange={(e) => setForm({ ...form, display_order: e.target.value })}
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2 self-end pb-2 text-xs font-bold text-neutral-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 accent-[#7A5A3C]"
            />
            Show on live website
          </label>

          <div className="flex flex-col-reverse gap-2 sm:col-span-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-xs font-bold text-neutral-600 hover:bg-neutral-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-1.5 rounded-lg px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: BROWN }}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      )}

      {/* Banner cards */}
      {loading && banners.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#E9DCC6] bg-white p-12 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading banners...
        </div>
      ) : banners.length === 0 ? (
        <div className="rounded-2xl border border-[#E9DCC6] bg-white p-10 text-center text-sm text-neutral-500">
          No hero banners yet. Click &quot;Add Banner Slide&quot; to create one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {banners.map((banner) => (
            <div key={banner.id} className="flex flex-col overflow-hidden rounded-2xl border border-[#E9DCC6] bg-white shadow-xs">
              <div className="relative h-40 bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={banner.image_url} alt={banner.title} className="h-full w-full object-cover" />
                <span
                  className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    banner.is_active === 1 ? "bg-green-600 text-white" : "bg-neutral-700 text-white"
                  }`}
                >
                  {banner.is_active === 1 ? "Live" : "Hidden"}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h4 className="text-sm font-bold text-[#1F1A17]">{banner.title}</h4>
                <p className="text-xs text-neutral-600">{banner.subtitle || "No subtitle"}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  Button: <span className="font-semibold">{banner.cta_text}</span> → {banner.cta_link}
                </p>
                <p className="text-xs text-neutral-500">Display order: {banner.display_order}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(banner)}
                    className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold text-white hover:opacity-90"
                    style={{ background: BROWN }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(banner)}
                    className="flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50"
                  >
                    {banner.is_active === 1 ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {banner.is_active === 1 ? "Hide" : "Show"}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteBanner(banner)}
                    className="flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
