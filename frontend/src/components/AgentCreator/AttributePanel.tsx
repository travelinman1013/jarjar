import { useAgentCreatorStore } from '../../stores/agentCreatorStore'
import { AttributeSlider } from './AttributeSlider'
import { TopicSelector } from './TopicSelector'

export function AttributePanel() {
  const attrs = useAgentCreatorStore((s) => s.attributes)
  const set = useAgentCreatorStore((s) => s.setAttribute)

  return (
    <div className="space-y-5">
      {/* Topic & Config */}
      <section>
        <h3 className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-2">
          Configuration
        </h3>
        <TopicSelector />
      </section>

      <div className="border-t border-gray-800" />

      {/* Demeanor */}
      <section>
        <h3 className="text-xs font-medium text-indigo-400 uppercase tracking-wider mb-2">
          Demeanor
        </h3>
        <AttributeSlider
          label="Warmth"
          lowLabel="Clinical"
          highLabel="Encouraging"
          value={attrs.demeanor.warmth}
          onChange={(v) => set('demeanor', 'warmth', v)}
        />
        <AttributeSlider
          label="Directness"
          lowLabel="Diplomatic"
          highLabel="Blunt"
          value={attrs.demeanor.directness}
          onChange={(v) => set('demeanor', 'directness', v)}
        />
        <AttributeSlider
          label="Formality"
          lowLabel="Casual Peer"
          highLabel="Corporate Panel"
          value={attrs.demeanor.formality}
          onChange={(v) => set('demeanor', 'formality', v)}
        />
      </section>

      {/* Behavior */}
      <section>
        <h3 className="text-xs font-medium text-indigo-400 uppercase tracking-wider mb-2">
          Behavior
        </h3>
        <AttributeSlider
          label="Probe Depth"
          lowLabel="Surface"
          highLabel="Relentless"
          value={attrs.behavior.probeDepth}
          onChange={(v) => set('behavior', 'probeDepth', v)}
        />
        <AttributeSlider
          label="Patience"
          lowLabel="Rushes You"
          highLabel="Infinite"
          value={attrs.behavior.patience}
          onChange={(v) => set('behavior', 'patience', v)}
        />
        <AttributeSlider
          label="Scaffolding"
          lowLabel="Sink or Swim"
          highLabel="Full Guidance"
          value={attrs.behavior.scaffolding}
          onChange={(v) => set('behavior', 'scaffolding', v)}
        />
        <AttributeSlider
          label="Challenge Style"
          lowLabel="Gentle Nudge"
          highLabel="Devil's Advocate"
          value={attrs.behavior.challengeStyle}
          onChange={(v) => set('behavior', 'challengeStyle', v)}
        />
      </section>

      {/* Expertise */}
      <section>
        <h3 className="text-xs font-medium text-indigo-400 uppercase tracking-wider mb-2">
          Expertise
        </h3>
        <AttributeSlider
          label="Technical Depth"
          lowLabel="Conceptual"
          highLabel="Implementation"
          value={attrs.expertise.technicalDepth}
          onChange={(v) => set('expertise', 'technicalDepth', v)}
        />
        <AttributeSlider
          label="Scope"
          lowLabel="Narrow Focus"
          highLabel="Cross-cutting"
          value={attrs.expertise.scope}
          onChange={(v) => set('expertise', 'scope', v)}
        />
        <AttributeSlider
          label="Seniority Lens"
          lowLabel="Junior Bar"
          highLabel="Staff+ Bar"
          value={attrs.expertise.seniorityLens}
          onChange={(v) => set('expertise', 'seniorityLens', v)}
        />
      </section>

      {/* Evaluation */}
      <section>
        <h3 className="text-xs font-medium text-indigo-400 uppercase tracking-wider mb-2">
          Evaluation
        </h3>
        <AttributeSlider
          label="Strictness"
          lowLabel="Generous"
          highLabel="Unforgiving"
          value={attrs.evaluation.strictness}
          onChange={(v) => set('evaluation', 'strictness', v)}
        />
        <AttributeSlider
          label="Feedback Detail"
          lowLabel="Big Picture"
          highLabel="Microscopic"
          value={attrs.evaluation.feedbackDetail}
          onChange={(v) => set('evaluation', 'feedbackDetail', v)}
        />
      </section>
    </div>
  )
}
