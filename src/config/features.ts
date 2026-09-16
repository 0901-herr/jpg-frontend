/**
 * Build-time feature flags. Each flag is baked in from a `VITE_FEATURE_*`
 * env var at build time (see `.env.example`) — there is no runtime toggle,
 * so changing one requires a rebuild.
 */
export const FEATURES = {
  /**
   * Folder/Category browse toggle (`BrowseViewToggle`), the category
   * `Select`, and the `CategoryTag` chip on file rows. OFF by default —
   * the client asked for the automatic-category feature to be hidden
   * while the code stays in place. Set `VITE_FEATURE_CATEGORY_VIEW=true`
   * to turn it back on.
   */
  categoryView: import.meta.env.VITE_FEATURE_CATEGORY_VIEW === 'true',

  /**
   * "Share…" on a chat's options menu, and the share link/modal it opens.
   * Projects and server-side chat persistence are always on regardless of
   * this flag — it gates sharing specifically. Set
   * `VITE_FEATURE_CHAT_SHARING=true` to turn it on.
   */
  chatSharing: import.meta.env.VITE_FEATURE_CHAT_SHARING === 'true',
}
