"use client"

import type { Dispatch, SetStateAction } from "react"

import { TagInput, type Tag } from "emblor"

export interface TechStackInputProps {
  id: string
  tags: Tag[]
  onChange: (tags: Tag[]) => void
  placeholder: string
  autocompleteOptions: Tag[]
  activeTagIndex: number | null
  setActiveTagIndex: Dispatch<SetStateAction<number | null>>
}

export function TechStackInput({
  id,
  tags,
  onChange,
  placeholder,
  autocompleteOptions,
  activeTagIndex,
  setActiveTagIndex,
}: TechStackInputProps) {
  return (
    <TagInput
      id={id}
      tags={tags}
      setTags={(nextTags) => onChange(typeof nextTags === "function" ? nextTags(tags) : nextTags)}
      placeholder={placeholder}
      enableAutocomplete={autocompleteOptions.length > 0}
      autocompleteOptions={autocompleteOptions}
      styleClasses={{
        inlineTagsContainer:
          "border-input rounded-md bg-background shadow-xs transition-[color,box-shadow] focus-within:border-ring outline-none focus-within:ring-[3px] focus-within:ring-ring/50 p-1 gap-1 mt-1",
        input: "w-full min-w-[80px] shadow-none px-2 h-7",
        tag: {
          body: "h-7 relative bg-background border border-input hover:bg-background rounded-md font-medium text-xs ps-2 pe-7",
          closeButton:
            "absolute -inset-y-px -end-px p-0 rounded-e-md flex size-7 transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] text-muted-foreground/80 hover:text-foreground",
        },
      }}
      activeTagIndex={activeTagIndex}
      setActiveTagIndex={setActiveTagIndex}
    />
  )
}
