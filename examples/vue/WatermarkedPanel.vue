<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ScreenOverlay } from 'veiltrace/browser'

// Supply an opaque, unique record issued by your own backend, never a user name.
const props = defineProps<{ recordId: string; namespace: string }>()
const host = ref<HTMLElement>()
let overlay: ScreenOverlay | undefined
function options() {
  return {
    recordId: props.recordId,
    namespace: props.namespace,
    amplitude: 1,
    channel: 'blue' as const,
  }
}
onMounted(() => {
  if (host.value) overlay = new ScreenOverlay({ target: host.value, ...options() })
})
watch(
  () => [props.recordId, props.namespace],
  () => {
    if (!host.value) return
    // Always clear the old session, including when new input is invalid.
    overlay?.dispose()
    overlay = undefined
    overlay = new ScreenOverlay({ target: host.value, ...options() })
  },
)
onBeforeUnmount(() => overlay?.dispose())
</script>

<template>
  <div ref="host" class="watermarked-panel"><slot /></div>
</template>

<style scoped>
.watermarked-panel {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
