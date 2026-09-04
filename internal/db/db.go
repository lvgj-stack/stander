package db

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"

	"github.com/lvgj-stack/stander/internal/config"
	"github.com/lvgj-stack/stander/internal/model/dal"
)

// Dao is the single gorm handle shared by the gorm-gen query layer (dal.Q) and
// the admin console's hand-written queries. Before the monorepo merge these were
// two separate connections to the same database.
var Dao *gorm.DB

func Init(c *config.Database) error {
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		c.Username, c.Password, c.Addr, c.DBName)

	dbLogger := gormlogger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		gormlogger.Config{
			SlowThreshold:             time.Second,
			Colorful:                  false,
			IgnoreRecordNotFoundError: true,
			ParameterizedQueries:      false,
			LogLevel:                  gormlogger.Info,
		},
	)

	openDb, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger:                                   dbLogger,
		DisableForeignKeyConstraintWhenMigrating: true,
	})
	if err != nil {
		return fmt.Errorf("open mysql: %w", err)
	}

	sqlDB, err := openDb.DB()
	if err != nil {
		return fmt.Errorf("get sql.DB: %w", err)
	}
	sqlDB.SetMaxIdleConns(3)
	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)

	Dao = openDb
	dal.SetDefault(Dao)
	return nil
}

func Get() *gorm.DB {
	return Dao
}

// Pinger adapts the package-level handle to the api.Prober interface used by
// the readiness probe.
type Pinger struct{}

// Ping checks that the database is reachable. It reports an error rather than
// panicking when Init has not run, so a misconfigured process fails its
// readiness check instead of crash-looping.
func (Pinger) Ping(ctx context.Context) error {
	if Dao == nil {
		return errors.New("database not initialised")
	}
	sqlDB, err := Dao.DB()
	if err != nil {
		return err
	}
	return sqlDB.PingContext(ctx)
}

// Close releases the connection pool.
func Close() error {
	if Dao == nil {
		return nil
	}
	sqlDB, err := Dao.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
