import {Slice} from '@tiptap/pm/model'
import type {Node as ProseMirrorNode} from '@tiptap/pm/model'

// ProseMirror's built-in plain text copy drops the list markers along with the
// markup, so a copied bullet list arrives at the paste target as a run of loose
// lines. Serializing to markdown-ish text keeps lists readable as text and lets
// the paste handler recognise them as markdown again.
const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList'])
const ITEM_TYPES = new Set(['listItem', 'taskItem'])

function inlineText(node: ProseMirrorNode): string {
	if (node.isText) {
		return node.text ?? ''
	}

	if (node.type.name === 'hardBreak') {
		return '\n'
	}

	let text = ''
	node.forEach(child => {
		text += inlineText(child)
	})
	return text
}

function serializeItem(item: ProseMirrorNode, depth: number, marker: string): string[] {
	const indent = '  '.repeat(depth)
	const lines: string[] = []
	let marked = false

	item.forEach(child => {
		if (LIST_TYPES.has(child.type.name)) {
			// A nested list is indented below the item's own line.
			lines.push(...serializeNode(child, depth + 1))
			return
		}

		for (const line of inlineText(child).split('\n')) {
			if (!marked) {
				lines.push(indent + marker + line)
				marked = true
				continue
			}
			lines.push('  '.repeat(depth + 1) + line)
		}
	})

	if (!marked) {
		lines.push(indent + marker.trimEnd())
	}

	return lines
}

function serializeNode(node: ProseMirrorNode, depth: number): string[] {
	const indent = '  '.repeat(depth)

	if (node.isText) {
		return [node.text ?? '']
	}

	if (LIST_TYPES.has(node.type.name)) {
		const lines: string[] = []
		let index = 0
		node.forEach(item => {
			let marker = '- '
			if (node.type.name === 'orderedList') {
				marker = `${Number(node.attrs.start ?? 1) + index}. `
			} else if (node.type.name === 'taskList') {
				marker = item.attrs.checked ? '- [x] ' : '- [ ] '
			}
			lines.push(...serializeItem(item, depth, marker))
			index++
		})
		return lines
	}

	if (ITEM_TYPES.has(node.type.name)) {
		return serializeItem(node, depth, '')
	}

	if (node.type.name === 'horizontalRule') {
		return [indent + '---']
	}

	// Blocks holding other blocks (blockquote, table cells, …) keep recursing so
	// their paragraphs don't run together on a single line.
	if (node.childCount > 0 && node.firstChild?.isBlock === true) {
		const lines: string[] = []
		node.forEach(child => {
			lines.push(...serializeNode(child, depth))
		})
		return lines
	}

	if (node.type.name === 'codeBlock') {
		return node.textContent.split('\n').map(line => indent + line)
	}

	return inlineText(node).split('\n').map(line => indent + line)
}

export function sliceToPlainText(slice: Slice): string {
	const lines: string[] = []
	slice.content.forEach(node => {
		lines.push(...serializeNode(node, 0))
	})
	return lines.join('\n')
}
