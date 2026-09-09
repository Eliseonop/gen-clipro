import { useState } from 'react'
import VideoEditor from '../editor/VideoEditor'
import JsonEditor from '../../components/JsonEditor'
import ResolvePanel from '../resolve/ResolvePanel'

export default function ProjectView({ project, onBack, onRefresh }) {
  const [showJson, setShowJson] = useState(false)
  const [showResolve, setShowResolve] = useState(false)

  return (
    <div className="project-view editor-mode">
      <VideoEditor
        project={project}
        onChange={onRefresh}
        onBack={onBack}
        onOpenJson={() => setShowJson(true)}
        onOpenResolve={() => setShowResolve(true)}
      />

      {showJson && (
        <JsonEditor
          pid={project.id}
          onClose={() => setShowJson(false)}
          onSaved={onRefresh}
        />
      )}

      {showResolve && (
        <ResolvePanel
          project={project}
          onClose={() => setShowResolve(false)}
        />
      )}
    </div>
  )
}
