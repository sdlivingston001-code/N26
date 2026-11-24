---
layout: default
title: Gang Deployment Options
---
<!--
  gang-deployment.md — Dropdown selector for gang deployment options.
  Shows the selected option's diagram and rules description.
  Scripts: deploymentOptionsUI.
  Data:    deploymentOptions.json (sourced from _data/deploymentOptions.yml).
  Images are stored under assets/images/deployment/.
-->

# Gang Deployment Options

<div class="selector-wrapper" style="justify-content:center;">
  <select id="dep-select" class="select-input"></select>
</div>

<div id="dep-display" class="mt-20"></div>

<script type="module">
  import { DeploymentOptionsUI } from '{{ "/assets/js/deploymentOptionsUI.js" | relative_url }}';
  DeploymentOptionsUI.init(
    "{{ '/data/deploymentOptions.json' | relative_url }}",
    "{{ '/assets/images/deployment' | relative_url }}"
  );
</script>

