package app.caulky.mobile;

/** Widget del escritorio: saldo total y de cada cuenta. */
public class AccountsWidget extends WidgetUpdater.Base {
    @Override
    String kind() {
        return Widgets.ACCOUNTS;
    }
}
