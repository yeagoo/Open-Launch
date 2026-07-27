import fs from "fs"
import path from "path"

const BLOG_CONTENT_DIR = path.resolve(process.cwd(), "content", "blog")
const SAFE_BLOG_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Fonction pour calculer le temps de lecture d'un article
export function calculateReadingTime(content: string): string {
  // Supprimer les balises MDX/HTML et le frontmatter
  const cleanContent = content
    .replace(/^---[\s\S]*?---/, "") // Enlever le frontmatter
    .replace(/<[^>]*>/g, "") // Enlever les balises HTML
    .replace(/\{[^}]*\}/g, "") // Enlever les composants JSX
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Enlever les liens markdown mais garder le texte
    .replace(/[#*`_~]/g, "") // Enlever la syntaxe markdown
    .replace(/\s+/g, " ") // Normaliser les espaces
    .trim()

  // Compter les mots
  const words = cleanContent.split(/\s+/).filter((word) => word.length > 0)
  const wordCount = words.length

  // Calculer le temps de lecture (moyenne: 200 mots par minute)
  const wordsPerMinute = 200
  const minutes = Math.ceil(wordCount / wordsPerMinute)

  return `${minutes} min`
}

// Fonction pour lire le contenu d'un fichier MDX et calculer le temps de lecture
export async function getReadingTimeForArticle(slug: string): Promise<string> {
  try {
    if (!SAFE_BLOG_SLUG.test(slug)) {
      throw new Error("Invalid blog slug")
    }
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal -- slug is restricted to lowercase kebab-case and the resolved parent is checked below.
    const filePath = path.resolve(BLOG_CONTENT_DIR, `${slug}.mdx`)
    if (path.dirname(filePath) !== BLOG_CONTENT_DIR) {
      throw new Error("Blog path escaped its content directory")
    }
    const content = fs.readFileSync(filePath, "utf8")
    return calculateReadingTime(content)
  } catch (error) {
    console.warn("Failed to calculate reading time for article:", slug, error)
    return "5 min" // Fallback par défaut
  }
}
