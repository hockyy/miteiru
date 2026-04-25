const shortcutGroups = [
  {
    title: "Playback",
    items: [
      {key: "E", description: "Toggle pause"},
      {key: "R", description: "Repeat current line"},
      {key: "Z", description: "Toggle video controls"},
      {key: "Ctrl + H", description: "Back to home"}
    ]
  },
  {
    title: "Panels",
    items: [
      {key: "X", description: "Toggle sidebar"},
      {key: "Ctrl + X", description: "Toggle vocab sidebar"},
      {key: "Esc", description: "Close info box / undo"},
      {key: "D", description: "Previous meaning box"}
    ]
  },
  {
    title: "Subtitles",
    items: [
      {key: "A", description: "Reload subtitle"},
      {key: "O", description: "Toggle CJK subtitle"},
      {key: "P", description: "Toggle secondary subtitle"},
      {key: "Y", description: "Toggle transliterations"},
      {key: "Ctrl + O", description: "Remove CJK subtitle"},
      {key: "Ctrl + P", description: "Remove secondary subtitle"}
    ]
  },
  {
    title: "Learning",
    items: [
      {key: "C", description: "Copy ruby content"},
      {key: "G", description: "Open Google Translate"},
      {key: "T", description: "Open DeepL"},
      {key: "Ctrl + Shift + L", description: "Toggle learning mode"},
      {key: "Ctrl + Shift + K", description: "Open flash cards"}
    ]
  },
  {
    title: "Timing",
    items: [
      {key: "[", description: "Shift CJK subtitle slower"},
      {key: "]", description: "Shift CJK subtitle faster"},
      {key: "Ctrl + [", description: "Shift main subtitle slower"},
      {key: "Ctrl + ]", description: "Shift main subtitle faster"}
    ]
  }
];

export const Key = ({
                      value,
                      extraClass = ""
                    }) => {
  return <div
      className={"unselectable whitespace-nowrap rounded-lg border border-blue-950 bg-white px-2.5 py-1.5 font-mono text-xs font-black text-blue-950 " + extraClass}
      style={{
        boxShadow: "2px 2px 0px 0px #93c5fd"
      }}>
    {value}
  </div>
}

export const KeyboardHelp = () => {
  return (
    <div className="group fixed bottom-4 right-4 z-50">
      <button
        type="button"
        className="rounded-full border-2 border-blue-300 bg-white px-4 py-2 text-sm font-black text-blue-900 shadow-lg transition-all hover:-translate-y-0.5 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
      >
        ⌨️ Shortcuts
      </button>
      <section className="pointer-events-none absolute bottom-12 right-0 w-[min(92vw,720px)] translate-y-2 rounded-3xl border-2 border-blue-200 bg-white/95 p-4 text-slate-900 opacity-0 shadow-2xl transition-all group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-blue-950">Keyboard Shortcuts</h2>
            <p className="text-xs text-slate-600">Tiny cheat sheet for when your mouse hand is busy with snacks.</p>
          </div>
          <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            {shortcutGroups.reduce((total, group) => total + group.items.length, 0)} shortcuts
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2">
            {shortcutGroups.map((group) => (
              <div key={group.title} className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                <h3 className="mb-2 text-xs font-black uppercase tracking-wide text-blue-800">{group.title}</h3>
                <div className="space-y-2">
                  {group.items.map((item) => (
                    <div key={`${group.title}-${item.key}`} className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2">
                      <Key value={item.key}/>
                      <span className="min-w-0 text-xs font-semibold text-slate-700">{item.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}