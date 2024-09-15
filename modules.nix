{ outputs, nixpkgs-matrix, system, ... }:

{
  polykey = { config, ... }:
    with nixpkgs-matrix.lib; {
      options = {
        services.polykey = {
          enable = mkEnableOption
            "Enable the Polykey agent. Users with the `polykey` group or root permissions will be able to manage the agent.";

          passwordFilePath = mkOption {
            type = with types; uniq str;
            description = ''
              The path to the Polykey password file. This is required to be set for the module to work, otherwise this module will fail.
            '';
          };

          recoveryCodeFilePath = mkOption {
            type = with types; uniq str;
            default = "";
            description = ''
              The path to the Polykey recovery code file. This is not required, but if set will read a recovery code from the provided path to bootstrap a new state with.
            '';
          };

          recoveryCodeOutPath = mkOption {
            type = with types; uniq str;
            description = ''
              The path to the Polykey recovery code file output location.
            '';
          };

          statePath = mkOption {
            type = with types; uniq str;
            default = "/var/lib/polykey";
            description =
              "The path to the Polykey node state directory. Will default to `/var/lib/polykey`, but can be overwritten to a custom path.";
          };
        };
      };
      config = mkIf config.services.polykey.enable {
        users.groups.polykey = { };

        environment.systemPackages = [ outputs.packages.${system}.default ];

        system.activationScripts.makeAgentPaths = ''
          mkdir -p ${config.services.polykey.statePath}
          chgrp -R polykey ${config.services.polykey.statePath}
          chmod 770 ${config.services.polykey.statePath}
        '';

        systemd.services.polykey = {
          description = "Polykey Agent";
          wantedBy = [ "multi-user.target" ];
          after = [ "network.target" ];
          serviceConfig = {
            User = "root";
            Group = "polykey";
            PermissionsStartOnly = true;
            LoadCredential =
              [ "password:${config.services.polykey.passwordFilePath}" ];
            ExecStartPre = ''
              -${outputs.packages.${system}.default}/bin/polykey \
              --password-file ''${CREDENTIALS_DIRECTORY}/password \
              --node-path ${config.services.polykey.statePath} \
              bootstrap  ${
                optionalString
                (config.services.polykey.recoveryCodeFilePath != "")
                "-rcf ${config.services.polykey.recoveryCodeFilePath}"
              }\
              --recovery-code-out-file ${config.services.polykey.recoveryCodeOutPath}
            '';
            ExecStart = ''
              ${outputs.packages.${system}.default}/bin/polykey \
              --password-file ''${CREDENTIALS_DIRECTORY}/password \
              --node-path ${config.services.polykey.statePath} \
              agent start \
              --recovery-code-out-file ${config.services.polykey.recoveryCodeOutPath}
            '';
          };
        };
      };
    };
  polykey-home = { config, ... }:
    with nixpkgs-matrix.lib; {
      options = {
        programs.polykey = {
          enable = mkEnableOption "Enable the user-space Polykey agent.";

          passwordFilePath = mkOption {
            type = with types; uniq str;
            description = ''
              The path to the Polykey password file. This is required to be set for the module to work, otherwise this module will fail.
            '';
          };

          recoveryCodeFilePath = mkOption {
            type = with types; uniq str;
            default = "";
            description = ''
              The path to the Polykey recovery code file. This is not required, but if set will read a recovery code from the provided path to bootstrap a new state with.
            '';
          };

          recoveryCodeOutPath = mkOption {
            type = with types; uniq str;
            description = ''
              The path to the Polykey recovery code file output location.
            '';
          };

          statePath = mkOption {
            type = with types; uniq str;
            default = "%h/.local/share/polykey";
            description =
              "The path to the Polykey node state directory. Will default to `$HOME/.local/share/polykey`, but can be overwritten to a custom path.";
          };
        };
      };
      config = mkIf config.programs.polykey.enable {
        home.packages = [ outputs.packages.${system}.default ];

        systemd.user.services.polykey = {
          Unit = { Description = "Polykey Agent"; };
          Service = {
            ExecStartPre = ''
              -${outputs.packages.${system}.default}/bin/polykey \
              --password-file ${config.programs.polykey.passwordFilePath} \
              --node-path ${config.programs.polykey.statePath} \
              bootstrap  ${
                optionalString
                (config.programs.polykey.recoveryCodeFilePath != "")
                "-rcf ${config.programs.polykey.recoveryCodeFilePath}"
              }\
              --recovery-code-out-file ${config.programs.polykey.recoveryCodeOutPath}
            '';
            ExecStart = ''
              ${outputs.packages.${system}.default}/bin/polykey \
              --password-file ${config.programs.polykey.passwordFilePath} \
              --node-path ${config.programs.polykey.statePath} \
              agent start \
              --recovery-code-out-file ${config.programs.polykey.recoveryCodeOutPath}
            '';
          };
        };
      };
    };
}
