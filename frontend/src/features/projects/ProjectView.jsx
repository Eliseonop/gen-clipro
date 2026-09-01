import { useState } from 'react'
import VideoTab from '../video/VideoTab'
import AudioTab from '../audio/AudioTab'
import VideoEditor from '../editor/VideoEditor'
import JsonEditor from '../../components/JsonEditor'
import ToolModal from '../../components/ToolModal'

export default function ProjectView({ project, onBack, onRefresh }) {
  const [tool, setTool] = useState(null)
  const [showJson, setShowJson] = useState(false)

  return (
    <div className="project-view editor-mode">
      <VideoEditor
        project={project}
        onChange={onRefresh}
        onBack={onBack}
        onOpenJson={() => setShowJson(true)}
        onOpenVideo={() => setTool('video')}
        onOpenAudio={() => setTool('audio')}
      />

      {tool === 'video' && (
        <ToolModal
          wide
          title="Caja video"
          icon="movie"
          onClose={() => setTool(null)}
        >
          <VideoTab project={project} onChange={onRefresh} />
        </ToolModal>
      )}

      {tool === 'audio' && (
        <ToolModal wide title="Audio" icon="mic" onClose={() => setTool(null)}>
          <AudioTab project={project} onChange={onRefresh} />
        </ToolModal>
      )}

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
