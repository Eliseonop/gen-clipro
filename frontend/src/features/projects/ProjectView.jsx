import { useState } from 'react'
import VideoEditor from '../editor/VideoEditor'
import JsonEditor from '../../components/JsonEditor'

export default function ProjectView({ project, onBack, onRefresh }) {
  const [showJson, setShowJson] = useState(false)

  return (
    <div className="project-view editor-mode">
      <VideoEditor
        project={project}
        onChange={onRefresh}
        onBack={onBack}
        onOpenJson={() => setShowJson(true)}
      />

      {showJson && (
        <JsonEditor
          pid={project.id}
          onClose={() => setShowJson(false)}
          onSaved={onRefresh}
        />
      )}
    </div>
  )
}
