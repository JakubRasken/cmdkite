import { expect, test } from "bun:test"
import { FileTree, type FileTreeDirectoryHandle } from "@pierre/trees"

test("reports directory expansion changes", () => {
  const tree = new FileTree({
    paths: ["src/"],
  })

  const src = tree.getItem("src/")
  if (!src || !src.isDirectory()) throw new Error("Expected src to be a directory")
  const directory = src as FileTreeDirectoryHandle

  directory.expand()
  expect(directory.isExpanded()).toBe(true)
  directory.collapse()
  expect(directory.isExpanded()).toBe(false)
  tree.cleanUp()
})
