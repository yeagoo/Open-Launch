// Twitter card image = the same dynamic card as the Open Graph image.
// Next.js does NOT automatically reuse opengraph-image for twitter:image
// when the page sets custom `twitter` metadata, so both conventions are
// declared explicitly. Route config (size/revalidate) must be declared
// in THIS file — Next can't read it through a re-export.
import ProjectOgImage, { size, contentType } from "./opengraph-image"

export { size, contentType }
export const revalidate = 86400
export default ProjectOgImage
