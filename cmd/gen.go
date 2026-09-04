package cmd

import (
	"strings"

	"github.com/heyhip/frog"
	"github.com/spf13/cobra"
	"gorm.io/gen"
	"gorm.io/gen/field"

	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/db"
)

var (
	genOutPath   string
	genModelPath string
)

var genCmd = &cobra.Command{
	Use:   "gen",
	Short: "\u4ece\u6570\u636e\u5e93\u751f\u6210 gorm-gen \u4ee3\u7801",
	Long:  "\u8fde\u63a5\u914d\u7f6e\u6587\u4ef6\u91cc\u7684\u6570\u636e\u5e93\uff0c\u91cd\u65b0\u751f\u6210 internal/model \u4e0b\u7684 entity \u4e0e dal \u4ee3\u7801\u3002",
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := config.InitConfig(configPath)
		if err != nil {
			return err
		}
		if err := db.Init(c.Database); err != nil {
			return err
		}
		DB := db.Get()

		g := gen.NewGenerator(gen.Config{
			Mode:              gen.WithDefaultQuery,
			OutPath:           genOutPath,
			ModelPkgPath:      genModelPath,
			FieldNullable:     true,
			FieldWithIndexTag: true,
			FieldWithTypeTag:  true,
		})
		g.WithJSONTagNameStrategy(func(columnName string) string {
			f := func(s string) string {
				if s == "" {
					return ""
				}
				return strings.ToLower(s[:1]) + s[1:]
			}
			return f(frog.Case2Camel(columnName))
		})

		g.UseDB(DB)
		node := g.GenerateModel("nodes")
		trafficPlan := g.GenerateModel("traffic_plan")
		udt := g.GenerateModel("user_daily_traffic")
		ncm := g.GenerateModel("node_chain_mappings")
		chain := g.GenerateModel("chains", gen.FieldRelate(field.HasOne, "Node", node,
			&field.RelateConfig{
				GORMTag: field.GormTag{"references": []string{"NodeID"}, "foreignKey": []string{"ID"}},
			}))
		user := g.GenerateModel("user", gen.FieldRelate(field.HasOne, "TrafficPlan", trafficPlan,
			&field.RelateConfig{
				GORMTag: field.GormTag{"references": []string{"PlanID"}, "foreignKey": []string{"ID"}},
			}))
		rule := g.GenerateModel("rules",
			gen.FieldRelate(field.HasOne, "Node", node,
				&field.RelateConfig{
					GORMTag: field.GormTag{"references": []string{"NodeID"}, "foreignKey": []string{"ID"}},
				}),
			gen.FieldRelate(field.HasOne, "Chain", chain,
				&field.RelateConfig{
					GORMTag: field.GormTag{"references": []string{"ChainID"}, "foreignKey": []string{"ID"}},
				}),
		)
		urcm := g.GenerateModel("user_role_chain_mappings", gen.FieldRelate(field.HasOne, "Chain", chain,
			&field.RelateConfig{
				GORMTag: field.GormTag{"references": []string{"ChainID"}, "foreignKey": []string{"ID"}},
			}))
		urnm := g.GenerateModel("user_role_node_mappings", gen.FieldRelate(field.HasOne, "Node", node,
			&field.RelateConfig{
				GORMTag: field.GormTag{"references": []string{"NodeID"}, "foreignKey": []string{"ID"}},
			}))
		chainGroups := g.GenerateModel("chain_groups", gen.FieldRelate(field.HasOne, "Chain", chain,
			&field.RelateConfig{
				GORMTag: field.GormTag{"references": []string{"ChainID"}, "foreignKey": []string{"ID"}},
			}), gen.FieldType("backup", "bool"), gen.FieldGenType("backup", "Bool"))
		g.ApplyBasic(
			chain,
			node,
			rule,
			urcm,
			urnm,
			udt,
			trafficPlan,
			user,
			ncm,
			chainGroups,
		)

		g.Execute()

		return nil
	},
}

func init() {
	genCmd.Flags().StringVar(&genOutPath, "out", "./internal/model/dal", "dal \u8f93\u51fa\u76ee\u5f55")
	genCmd.Flags().StringVar(&genModelPath, "model-out", "./internal/model/entity", "entity \u8f93\u51fa\u76ee\u5f55")
	rootCmd.AddCommand(genCmd)
}
