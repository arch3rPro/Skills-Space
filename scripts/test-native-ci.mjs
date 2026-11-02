// Default CI covers demonstrated platform failures and core user-data risks.
// Extended feature combinations remain available through the explicit full scope.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';

const common = [
  "versions::tests::stable_versions_compare_numerically_and_reject_unusable_tags",
  "versions::tests::metadata_checks_distinguish_available_current_unreleased_and_retry",
  "upstream::pi_removal::tests::content_or_configuration_changes_refuse_move_and_trash_failure_keeps_content",
  "upstream::dsh::policy::tests::prepared_policy_write_rejects_changed_and_newly_created_destinations",
  "upstream::creation::tests::invalid_paths_existing_files_and_changed_confirmation_do_not_write",
  "upstream::dependencies::tests::real_dependency_install_preserves_eve_documents_without_name_frontmatter",
  "upstream::dependencies::tests::real_sync_repairs_missing_agent_targets_without_retired_force_flag",
  "upstream::dependencies::tests::recursive_filters_link_to_dependencies_and_cleanup_lists_unselected_agent_paths",
  "upstream::dsh::native::tests::native_creation_validates_roots_names_and_original_init",
  "upstream::eve::tests::real_eve_selected_copy_preserves_unselected_slot_and_rejects_invalid_targets",
  "upstream::inspection_session::tests::batch_recheck_rejects_changed_selected_content_but_accepts_unrelated_commits",
  "upstream::inspection_session::tests::media_skill_over_four_mib_installs_and_reinstalls_for_dsh",
  "upstream::provider::tests::original_legacy_download_lifecycle_reinstall_and_uninstall_in_both_scopes",
  "upstream::provider::tests::provider_failures_digest_alias_paths_internal_and_changed_index_do_not_write",
  "upstream::restoration::tests::invalid_lock_and_changed_lock_are_not_executed",
  "upstream::restoration::tests::real_dependency_restore_lists_extra_skills_and_repairs_missing_targets",
  "upstream::restoration::tests::real_git_restore_refreshes_shared_content_and_lock_preserving_independent_copy",
  "upstream::restoration::tests::real_local_restore_supports_sources_created_with_init",
  "upstream::restoration::tests::real_restore_preserves_eve_content_without_standard_name_metadata",
  "upstream::restoration::tests::reviewed_reinstall_rechecks_local_edits_and_retries_without_full_inventory_prepare",
  "upstream::skill_sync::tests::broken_link_cleanup_uses_existing_removal_review_and_never_deletes_replacements",
  "upstream::skill_sync::tests::propagation_preserves_modified_copies_and_retry_skips_completed_content",
  "upstream::skill_sync::tests::stale_source_reviews_are_rejected_but_confirmed_target_replacements_are_allowed",
  "upstream::skill_sync::tests::standalone_file_copy_link_update_and_owned_cleanup",
  "upstream::tests::original_discovery_priority_matches_installed_bytes_in_both_scopes",
  "upstream::tests::real_cli_install_verification_matches_upstream_excluded_files",
  "upstream::tests::tree_signature_uses_portable_member_names_without_normalizing_file_bytes",
  "upstream::tests::real_upstream_git_lifecycle_checks_updates_and_removes_in_both_scopes",
  "upstream::tests::real_source_alias_prefix_and_filter_install_only_reviewed_skill_in_both_scopes",
  "upstream::tests::rust_and_node_canonical_paths_agree_for_existing_platform_directories",
  "upstream::document_diff::tests::file_changes_restore_and_stale_path_protection",
  "upstream::node_runtime::tests::node_minimum_boundary_and_invalid_versions_are_explicit",
  "upstream::node_runtime::tests::node_archive_hash_rejects_truncation_and_corruption_before_extraction",
  "upstream::pi::tests::directory_rules_round_trip_and_reject_stale_malformed_and_locked_writes",
  "upstream::hermes::tests::settings_save_preserves_unknown_yaml_and_rejects_stale_versions",
  "upstream::hermes::tests::project_shared_skills_are_observed_before_trust_without_importing_global_installs"
];
const unix = [
  "upstream::dsh::policy::tests::prepared_policy_write_rejects_links_without_modifying_shared_bytes",
  "upstream::dependencies::tests::pnpm_links_are_discovered_and_linked_installation_parents_are_blocked",
  "upstream::eve::tests::eve_linked_parents_and_partial_zero_exit_are_not_verified"
];
export const criticalTests = (platform = process.platform) => [...common, ...(platform === 'win32' ? [] : unix)];

const fastModules = ['preferences::', 'marketplace::'];
export function selectCritical(available, ignored, platform = process.platform) {
  const required = criticalTests(platform);
  const missing = required.filter(name => !available.has(name));
  if (missing.length) throw Error('Required CI checks are missing: '+missing.join(', '));
  const skipped = required.filter(name => ignored.has(name));
  if (skipped.length) throw Error('Required CI checks cannot be ignored: '+skipped.join(', '));
  const fast = [...available].filter(name => fastModules.some(prefix => name.startsWith(prefix)) && !ignored.has(name));
  for (const prefix of fastModules) {
    if (!fast.some(name => name.startsWith(prefix))) throw Error('Required native module has no runnable checks: '+prefix);
  }
  return [...new Set([...required, ...fast])];
}

function main() {
  const [scope = 'critical', target] = process.argv.slice(2);
  if (!['critical', 'full'].includes(scope)) throw Error('Expected critical or full native test scope.');
  const args = ['test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', ...(target ? ['--target', target] : []), '--lib'];
  const artifactFile = process.env.NATIVE_TEST_ARTIFACTS;
  let binary;
  if (artifactFile) {
    const artifacts = readFileSync(artifactFile, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
      .filter(value => value.reason === 'compiler-artifact' && value.target?.name === 'skills_space_lib' && value.profile?.test && value.executable);
    if (artifacts.length !== 1) throw Error('Expected one compiled native test executable from Cargo.');
    binary = artifacts[0].executable;
  }
  const command = binary || 'cargo';
  const runnerArgs = binary ? [] : [...args, '--'];
  let selected = [];
  if (scope === 'critical') {
    const list = extra => {
      const result = spawnSync(command, [...runnerArgs, '--list', ...extra], {encoding:'utf8', stdio:['ignore','pipe','inherit']});
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
      return new Set(result.stdout.split(/\r?\n/).filter(line => line.endsWith(': test')).map(line => line.slice(0, -6)));
    };
    selected = selectCritical(list([]), list(['--ignored']));
  }
  console.log(scope === 'critical' ? `Running ${selected.length} required native checks.` : 'Running the explicitly selected full native suite.');
  const result = spawnSync(command, [...runnerArgs, '--test-threads=1', ...(selected.length ? ['--exact', ...selected] : [])], {stdio:'inherit'});
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
