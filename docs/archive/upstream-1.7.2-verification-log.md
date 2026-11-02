# 1.7.2 四项能力测试日志归档

记录日期：2026-10-13。来自已结束的隔离测试；仅保留最终接受的测试输出，不包含测试 HOME、凭据或运行缓存。不是本次迁移重新执行的测试。验证背景见[能力计划](../specs/0004-upstream-capability-completion-plan.md)。

## features-accepted.log

```text
   Compiling skills-space v0.1.0 (~/<project>/src-tauri)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 4.24s
     Running unittests src/lib.rs (src-tauri/target/debug/deps/skills_space_lib-c1214333a6b98d99)

running 73 tests
test marketplace::tests::flight_board_preserves_order_and_ignores_unrelated_arrays ... ok
test marketplace::tests::http_errors_are_not_empty_results ... ok
test marketplace::tests::live_discovery_contract ... ignored, Requires public network
test marketplace::tests::search_distinguishes_empty_invalid_and_owner_mismatch ... ok
test upstream::creation::tests::invalid_paths_existing_files_and_changed_confirmation_do_not_write ... ok
test upstream::creation::tests::real_init_creates_without_installing_then_previews_installs_and_removes ... ok
test upstream::creation::tests::zero_exit_without_template_is_not_success ... ok
test upstream::dependencies::tests::declared_git_sources_install_via_original_sync_and_cleanup_rechecks_declarations ... ok
test upstream::dependencies::tests::explicit_source_conflicts_block_sync_and_preserve_copies_and_locks ... ok
test upstream::dependencies::tests::malformed_or_secret_declarations_block_cleanup_without_leaking_credentials ... ok
test upstream::dependencies::tests::pinned172_direct_optional_peer_npm_declarations_and_no_unreviewed_cleanup ... ok
test upstream::dependencies::tests::pnpm_links_are_discovered_and_linked_installation_parents_are_blocked ... ok
test upstream::dependencies::tests::real_dependency_install_preserves_eve_documents_without_name_frontmatter ... ok
test upstream::dependencies::tests::real_sync_discovers_scoped_packages_root_precedence_and_preserves_unselected_copy ... ok
test upstream::dependencies::tests::real_sync_repairs_missing_agent_targets_without_retired_force_flag ... ok
test upstream::dependencies::tests::recursive_filters_link_to_dependencies_and_cleanup_lists_unselected_agent_paths ... ok
test upstream::dependencies::tests::stale_source_lock_target_and_invalid_inputs_are_rejected ... ok
test upstream::dependencies::tests::zero_exit_without_changes_and_partial_actual_results_are_not_success ... ok
test upstream::downloads::tests::direct_changed_preview_unsafe_archive_and_invalid_payload_never_install ... ok
test upstream::downloads::tests::original_direct_markdown_zip_and_tar_lifecycle_preserves_sources_and_has_no_locks ... ok
test upstream::eve::tests::eve_linked_parents_and_partial_zero_exit_are_not_verified ... ok
test upstream::eve::tests::real_eve_mixed_install_transforms_each_slot_and_uninstall_removes_all_eve_copies_only ... ok
test upstream::eve::tests::real_eve_project_git_check_update_replays_recorded_subagents_and_verifies_conversion ... ok
test upstream::eve::tests::real_eve_selected_copy_preserves_unselected_slot_and_rejects_invalid_targets ... ok
test upstream::plugins::tests::original_plugin_git_lifecycle_keeps_raw_identity_and_global_only_group_record ... ok
test upstream::plugins::tests::plugin_deep_paths_direct_manifest_ambiguity_and_invalid_manifest_boundaries ... ok
test upstream::plugins::tests::plugin_manifest_preview_selection_and_changed_group_require_new_confirmation ... ok
test upstream::provider::tests::original_legacy_download_lifecycle_reinstall_and_uninstall_in_both_scopes ... ok
test upstream::provider::tests::original_v2_markdown_zip_and_targz_install_only_selected_artifacts ... ok
test upstream::provider::tests::original_well_known_digest_update_and_removed_skill_requires_user_uninstall ... ok
test upstream::provider::tests::provider_failures_digest_alias_paths_internal_and_changed_index_do_not_write ... ok
test upstream::provider::tests::provider_redirect_partial_discovery_and_zero_exit_without_files_are_not_success ... ok
test upstream::restoration::tests::invalid_lock_and_changed_lock_are_not_executed ... ok
test upstream::restoration::tests::missing_generic_git_url_is_blocked_without_network_and_credentials_are_not_exposed ... ok
test upstream::restoration::tests::partial_actual_state_is_reported_per_skill_even_with_zero_exit ... ok
test upstream::restoration::tests::real_dependency_restore_lists_extra_skills_and_repairs_missing_targets ... ok
test upstream::restoration::tests::real_git_restore_refreshes_shared_content_and_lock_preserving_independent_copy ... ok
test upstream::restoration::tests::real_local_restore_supports_sources_created_with_init ... ok
test upstream::restoration::tests::real_restore_preserves_eve_content_without_standard_name_metadata ... ok
test upstream::restoration::tests::zero_exit_without_restore_does_not_report_success ... ok
test upstream::source_removal::tests::source_membership_is_rechecked_and_other_sources_and_files_survive ... ok
test upstream::tests::changed_preview_is_rejected_before_installation ... ok
test upstream::tests::changed_removal_plan_is_rejected_without_deleting_new_installations ... ok
test upstream::tests::internal_preview_rechecks_content_flags_and_duplicate_names_before_installation ... ok
test upstream::tests::pinned172_shared_paths_bom_metadata_and_local_source_lock ... ok
test upstream::tests::pinned_source_parser_resolves_prefixes_aliases_filters_and_custom_host ... ok
test upstream::tests::preview_uses_upstream_yaml_and_hides_internal_sources ... ok
test upstream::tests::real_cli_install_verification_matches_upstream_excluded_files ... ok
test upstream::tests::real_explicit_internal_selection_installs_only_selected_skills_in_both_scopes ... ok
test upstream::tests::real_https_git_source_lifecycle ... ignored, requires public HTTPS access; mutation stays inside temporary HOME
test upstream::tests::real_internal_git_skill_checks_updates_and_removes_in_both_scopes ... ok
test upstream::tests::real_source_alias_prefix_and_filter_install_only_reviewed_skill_in_both_scopes ... ok
test upstream::tests::real_upstream_git_lifecycle_checks_updates_and_removes_in_both_scopes ... ok
test upstream::tests::real_upstream_global_install_and_selected_uninstall_preserve_other_agent ... ok
test upstream::tests::real_upstream_project_copy_is_separate_from_global_scope ... ok
test upstream::tests::real_upstream_shared_cleanup_is_reported_as_uncertain ... ok
test upstream::tests::rejects_remote_and_invalid_project_before_process_execution ... ok
test upstream::tests::same_name_agent_installations_keep_distinct_identity_and_block_name_mutation ... ok
test upstream::tests::shared_batch_expansion_is_per_skill_and_does_not_remove_another_skills_independent_copy ... ok
test upstream::tests::shared_removal_reports_retained_content_until_remaining_copy_is_explicitly_selected ... ok
test upstream::tests::shared_skills_do_not_detect_uninstalled_agents ... ok
test upstream::tests::source_filter_miss_hidden_ambiguity_and_extra_selection_do_not_install ... ok
test upstream::tests::timeout_terminates_descendants_instead_of_leaving_a_late_mutation ... ok
test upstream::tests::unsupported_source_is_rejected_without_installing ... ok
test upstream::tests::update_has_explicit_scope_and_never_becomes_check_or_agent_update ... ok
test upstream::tests::zero_exit_noop_does_not_verify_install_or_removal ... ok
test upstream::usage::tests::changed_materialization_never_launches_agent_and_stop_ends_descendants ... ok
test upstream::usage::tests::changed_node_modules_source_invalid_agents_and_foreign_cleanup_are_blocked ... ok
test upstream::usage::tests::original_direct_download_use_preserves_support_and_never_creates_locks ... ok
test upstream::usage::tests::original_git_use_accepts_openclaw_without_retired_flag_and_cleans_clone ... ok
test upstream::usage::tests::original_provider_use_keeps_map_files_and_zero_exit_without_preparation_fails ... ok
test upstream::usage::tests::original_use_agent_has_tty_accepts_input_and_preserves_exit_status ... ok
test upstream::usage::tests::original_use_prompt_retains_support_files_until_release_and_never_installs ... ok

test result: ok. 71 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 170.43s
```

## features-public.log

```text
    Finished `test` profile [unoptimized + debuginfo] target(s) in 0.41s
     Running unittests src/lib.rs (src-tauri/target/debug/deps/skills_space_lib-c1214333a6b98d99)

running 3 tests
test marketplace::tests::live_discovery_contract ... ok
test upstream::downloads::tests::real_https_direct_download_lifecycle ... ok
test upstream::tests::real_https_git_source_lifecycle ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 71 filtered out; finished in 23.38s
```

## source-removal-scopes.log

```text
   Compiling skills-space v0.1.0 (~/<project>/src-tauri)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 3.69s
     Running unittests src/lib.rs (src-tauri/target/debug/deps/skills_space_lib-c1214333a6b98d99)

running 1 test
test upstream::source_removal::tests::source_membership_is_rechecked_and_other_sources_and_files_survive ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 73 filtered out; finished in 7.11s
```
