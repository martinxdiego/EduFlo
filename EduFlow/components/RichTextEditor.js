'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { useState, useCallback, useEffect, useRef, Fragment } from 'react'
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Heading2, Heading3,
  Undo, Redo, RemoveFormatting, TableIcon, ImageIcon,
  Link as LinkIcon, Minus, Quote
} from 'lucide-react'

const MenuButton = ({ onClick, isActive, children, title, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    disabled={disabled}
    className={`p-1.5 rounded transition-colors ${
      disabled ? 'text-gray-300 cursor-not-allowed' :
      isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
    }`}
  >
    {children}
  </button>
)

const Divider = () => <div className="w-px h-4 bg-gray-200 mx-1" />

export default function RichTextEditor({ content, onChange, placeholder = 'Text eingeben...', minHeight = '120px' }) {
  const toolbarRef = useRef(null)
  const [isSticky, setIsSticky] = useState(false)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Image.configure({ inline: true, allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline' } }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none px-4 py-3`,
        style: `min-height: ${minHeight}`,
      },
    },
  })

  // Sticky toolbar on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (toolbarRef.current) {
        const rect = toolbarRef.current.getBoundingClientRect()
        setIsSticky(rect.top <= 64)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const fileInputRef = useRef(null)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageLoading, setImageLoading] = useState(false)
  const [imageError, setImageError] = useState('')

  const addImage = useCallback(() => {
    setShowImageDialog(true)
    setImageUrlInput('')
    setImageError('')
  }, [])

  const insertImageFromUrl = useCallback(() => {
    if (!editor || !imageUrlInput.trim()) return
    setImageLoading(true)
    setImageError('')
    const img = new window.Image()
    img.onload = () => {
      editor.chain().focus().setImage({ src: imageUrlInput.trim() }).run()
      setShowImageDialog(false)
      setImageLoading(false)
    }
    img.onerror = () => {
      setImageError('Bild konnte nicht geladen werden. Bitte URL überprüfen.')
      setImageLoading(false)
    }
    img.src = imageUrlInput.trim()
  }, [editor, imageUrlInput])

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    if (!file.type.startsWith('image/')) {
      setImageError('Bitte nur Bilddateien auswählen (JPG, PNG, GIF, WebP).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('Bild ist zu gross (max. 5 MB).')
      return
    }
    setImageLoading(true)
    setImageError('')
    const reader = new FileReader()
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result }).run()
      setShowImageDialog(false)
      setImageLoading(false)
    }
    reader.onerror = () => {
      setImageError('Fehler beim Lesen der Datei.')
      setImageLoading(false)
    }
    reader.readAsDataURL(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [editor])

  const addLink = useCallback(() => {
    if (!editor) return
    const url = window.prompt('Link-URL eingeben:')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }, [editor])

  const insertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  if (!editor) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white animate-pulse" style={{ minHeight }}>
        <div className="h-10 bg-gray-50 border-b" />
        <div className="p-4 space-y-2">
          <div className="h-3 bg-gray-100 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
        </div>
      </div>
    )
  }

  const handleEditorDrop = useCallback((e) => {
    const files = e.dataTransfer?.files
    if (!files?.length || !editor) return
    const file = files[0]
    if (!file.type.startsWith('image/')) return
    e.preventDefault()
    e.stopPropagation()
    if (file.size > 5 * 1024 * 1024) return
    const reader = new FileReader()
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result }).run()
    }
    reader.readAsDataURL(file)
  }, [editor])

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all"
      onDrop={handleEditorDrop} onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault() }}>
      {/* Toolbar */}
      <div
        ref={toolbarRef}
        className={`flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm flex-wrap transition-shadow ${
          isSticky ? 'sticky top-16 z-20 shadow-sm' : ''
        }`}
      >
        {/* Text formatting */}
        <MenuButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} title="Fett (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Kursiv (Ctrl+I)">
          <Italic className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Unterstrichen (Ctrl+U)">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </MenuButton>

        <Divider />

        {/* Headings */}
        <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} title="Überschrift 2">
          <Heading2 className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} title="Überschrift 3">
          <Heading3 className="h-3.5 w-3.5" />
        </MenuButton>

        <Divider />

        {/* Lists */}
        <MenuButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} title="Aufzählung">
          <List className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} title="Nummerierung">
          <ListOrdered className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} title="Zitat">
          <Quote className="h-3.5 w-3.5" />
        </MenuButton>

        <Divider />

        {/* Alignment */}
        <MenuButton onClick={() => editor.chain().focus().setTextAlign('left').run()} isActive={editor.isActive({ textAlign: 'left' })} title="Links">
          <AlignLeft className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().setTextAlign('center').run()} isActive={editor.isActive({ textAlign: 'center' })} title="Zentriert">
          <AlignCenter className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().setTextAlign('right').run()} isActive={editor.isActive({ textAlign: 'right' })} title="Rechts">
          <AlignRight className="h-3.5 w-3.5" />
        </MenuButton>

        <Divider />

        {/* Insert */}
        <MenuButton onClick={insertTable} title="Tabelle einfügen">
          <TableIcon className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={addImage} title="Bild einfügen">
          <ImageIcon className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={addLink} isActive={editor.isActive('link')} title="Link einfügen">
          <LinkIcon className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Trennlinie">
          <Minus className="h-3.5 w-3.5" />
        </MenuButton>

        <Divider />

        {/* History & clear */}
        <MenuButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Rückgängig (Ctrl+Z)">
          <Undo className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Wiederholen (Ctrl+Y)">
          <Redo className="h-3.5 w-3.5" />
        </MenuButton>
        <MenuButton onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()} title="Formatierung entfernen">
          <RemoveFormatting className="h-3.5 w-3.5" />
        </MenuButton>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Image Upload Dialog */}
      {showImageDialog && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowImageDialog(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 text-sm">Bild einfügen</h3>

            {/* File Upload */}
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageLoading}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <ImageIcon className="h-6 w-6 mx-auto text-gray-400 mb-1" />
                <span className="text-sm text-gray-600">Datei auswählen oder hierher ziehen</span>
                <span className="block text-xs text-gray-400 mt-1">JPG, PNG, GIF, WebP (max. 5 MB)</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gray-200" />
              oder
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* URL Input */}
            <div className="flex gap-2">
              <input
                type="url"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="https://beispiel.ch/bild.jpg"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
                onKeyDown={(e) => e.key === 'Enter' && insertImageFromUrl()}
              />
              <button
                type="button"
                onClick={insertImageFromUrl}
                disabled={!imageUrlInput.trim() || imageLoading}
                className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {imageLoading ? '...' : 'Einfügen'}
              </button>
            </div>

            {imageError && <p className="text-xs text-red-500">{imageError}</p>}

            <div className="flex justify-end">
              <button type="button" onClick={() => setShowImageDialog(false)} className="text-sm text-gray-500 hover:text-gray-700">Abbrechen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
