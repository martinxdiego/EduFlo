'use client'

import { Component } from 'react'

export default class MaterialErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidUpdate(previous) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-3">
        <h2 className="text-lg font-semibold">Dieses Material konnte nicht angezeigt werden.</h2>
        <p>Öffnen Sie ein anderes Material oder versuchen Sie es erneut. Ihr gespeichertes Material bleibt erhalten.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => this.setState({ failed: false })}>Erneut versuchen</button>
          <button type="button" className="rounded-lg border px-4 py-2" onClick={this.props.onBack}>Zur Bibliothek</button>
        </div>
      </section>
    )
  }
}
