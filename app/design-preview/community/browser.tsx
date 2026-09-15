import { hydrateRoot } from "react-dom/client"

import { CommunityPreview } from "./community-preview"

const root = document.getElementById("community-root")
if (!root) throw new Error("Community preview root is missing")
hydrateRoot(root, <CommunityPreview />)
